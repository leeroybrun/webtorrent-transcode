const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const arch = require('arch');
const mime = require('mime');

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const TRANSCODER_STATUS = {
  RUNNING: 'running',
  ENDED: 'ended',
  ERROR: 'error'
}

/**
 *  Transcoder
 *
 *  Used to transcode files/streams to MP4.
 *  For every transcoding you sould have one transcoder.
 *  If you try to start a new transcoding with the same transcoder, the previous Ffmpeg process will be killed.
 */

 /*
    Sources :
      - FFMpeg options
        - https://github.com/jansmolders86/mediacenterjs/blob/master/lib/transcoding/desktop.js
      - MP4 Streaming :
        - https://superuser.com/questions/438390/creating-mp4-videos-ready-for-http-streaming
        - https://salman-w.blogspot.ch/2013/08/fast-start-enabled-videos-with-ffmpeg.html
      - WebM
        - https://stackoverflow.com/questions/20665982/convert-videos-to-webm-via-ffmpeg-faster
      - Matroska container (subtitles)
        - https://superuser.com/questions/650848/realtime-transcoding-to-h264aac-in-matroska-container
      Documentation :
        - https://trac.ffmpeg.org/wiki/Encode/H.264
        - https://trac.ffmpeg.org/wiki/StreamingGuide
        - https://trac.ffmpeg.org/wiki/EncodingForStreamingSites
        - https://www.ffmpeg.org/ffmpeg-formats.html#Options-8
      Examples :
        - https://github.com/acidhax/streaming-media-encoder
        - https://github.com/jaruba/PowderPlayer
        - https://www.sodaplayer.com/
      To follow :
        - https://github.com/butterproject/butter-desktop/issues/528#issuecomment-267760909
        - https://github.com/jhiesey/videostream/issues/29
      Ffmpeg stream :
        - https://github.com/fluent-ffmpeg/node-fluent-ffmpeg/issues/380
      Seeking :
        - https://github.com/fluent-ffmpeg/node-fluent-ffmpeg/issues/684
        - https://github.com/fluent-ffmpeg/node-fluent-ffmpeg/issues/137
        - https://stackoverflow.com/questions/10947896/seeking-video-while-transcoding-with-ffmpeg

        - Inject JS in HTML5 player to get seek position with time and not bytes
        - Seek with Ffmpeg (time range) and not with createReadStream
      Filtering:
        - Only transcode needed parts/formats
        - Don't transcode MP4
        - MKV only transcode audio? (https://www.reddit.com/r/Chromecast/comments/22wbge/videostream_now_supports_all_file_formats/cgrc8og/)
  */

// Service to play videos files
class Transcoder {
  constructor() {
    this.command = null;
    this.status = null;
  }

  static async needsTranscoding(input) {
    let transcode = { video: false, audio: false };

    try {
      const metadata = await Transcoder.getMetadata(input);

      transcode = metadata.streams.reduce(function(ret, stream) {
        ret[stream.codec_type] = ret[stream.codec_type] || !Transcoder.streamShouldTransmux(stream);
        return ret;
      }, transcode)
    } catch(e) {
      console.log('Cannot get metadata: '+ e);
      return null;
    }
    
    return transcode.video;
  }

  static streamShouldTransmux(stream) {
    var type = stream.codec_type;
    var name = stream.codec_name.toLowerCase();

    if (type == 'video') {
      return name.indexOf('h264') != -1;
    } else if (type == 'audio') {
      return name.indexOf('aac') != -1;
    }
  }

  killProcess() {
    if(this.command && this.status === TRANSCODER_STATUS.RUNNING) {
      console.log('Killing previous Ffmpeg process for this transcoder.');
      this.command.kill();
      this.command = null;

      return sleep(1000);
    }
  }

  async transcode(input, output, options = {}) {
    await this.killProcess(); // We have to wait some time for the process to be killed, otherwise we will kill the new process we just started...

    return new Promise((resolve, reject) => {
      this.status = TRANSCODER_STATUS.RUNNING;

      this.command = new ffmpeg()
        .input(input)
        .output(output)
        /*  We can't use WebM as it's not compatible with Safari/iOS : https://caniuse.com/#feat=webm
        .videoCodec('libvpx')
        .audioCodec('libvorbis')
        .addOption('-threads', '0')
        .format('webm')*/
        .videoCodec('libx264')
        .audioCodec('aac')
        // TODO: check settings for quality
        .addOption([
          // Try to remove green artifacts when seeking
          //'-vf yadif',
          //'-flags2 -fastpskip',
          //'-fast-pskip 0',
          //'-g 30', // Forces (at least) every 30nd frame to be a keyframe

          '-threads 1', // 0
          '-crf 22', // https://trac.ffmpeg.org/wiki/Encode/H.264#a1.ChooseaCRFvalue
          //'-movflags faststart', // https://superuser.com/questions/438390/creating-mp4-videos-ready-for-http-streaming
          '-preset ultrafast', // https://trac.ffmpeg.org/wiki/Encode/H.264#a2.Chooseapreset
          '-tune zerolatency', // https://superuser.com/a/564404,
          '-movflags isml+frag_keyframe+empty_moov+faststart',
          '-f ismv',

          // Probably don't need this as we are outputing to a temp file
          //'-maxrate 2500k', // https://trac.ffmpeg.org/wiki/EncodingForStreamingSites#a-maxrate
          //'-bufsize 5000k', // https://trac.ffmpeg.org/wiki/EncodingForStreamingSites#a-bufsize
        ])
        .format('mp4')
        .on('start', function(commandLine) {
          console.log('Transcoding started.');
          console.log(commandLine);
          options.onStart && options.onStart(commandLine);
        })
        .on('progress', progress => {
          console.log(progress);
          options.onProgress && options.onProgress(progress);
        })
        .on('error', (e, a1, a2) => {
          console.log('Transcoding error.', e);
          this.killProcess();
          this.status = TRANSCODER_STATUS.ERROR;
          return reject(e);
        })
        /*.on('stderr', (stderrLine) => {
          stderrLines.push(stderrLine);
        })*/
        .on('end', () => {
          console.log('Transcoding ended.');
          this.killProcess();
          this.status = TRANSCODER_STATUS.ENDED;
          return resolve();
        });

        if(options.seek) {
          console.log('Seeking input to '+ options.seek);
          this.command.seekInput(options.seek);
        }

        this.command.run();
    });
  }

  static async getMetadata(input) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(input, (err, metadata) => {
        if(err) {
          return reject(err);
        }

        return resolve(metadata);
      });
    });
  }
}

module.exports = Transcoder;
