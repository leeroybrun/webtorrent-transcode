const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const arch = require('arch');

const mime = require('mime');
const ffmpeg = require('fluent-ffmpeg');

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
  */

// Service to play videos files
class Transcoder {
  constructor() {
    this.command = null;
    this.status = null;
  }

  static needsTranscoding(fileName) {
    const mimeType = mime.getType(fileName);
    return !mimeType.match(/mp4$/);
  }

  killPreviousProcess() {
    if(this.command && this.status === TRANSCODER_STATUS.RUNNING) {
      console.log('Killing previous Ffmpeg process for this transcoder.');
      this.command.kill();
    }
  }

  async transcode(input, output, events = {}) {
    this.killPreviousProcess();

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
          '-threads 1', // 0
          '-crf 22', // https://trac.ffmpeg.org/wiki/Encode/H.264#a1.ChooseaCRFvalue
          '-movflags faststart', // https://superuser.com/questions/438390/creating-mp4-videos-ready-for-http-streaming
          '-maxrate 2500k', // https://trac.ffmpeg.org/wiki/EncodingForStreamingSites#a-maxrate
          '-bufsize 5000k', // https://trac.ffmpeg.org/wiki/EncodingForStreamingSites#a-bufsize
          '-preset ultrafast', // https://trac.ffmpeg.org/wiki/Encode/H.264#a2.Chooseapreset
          '-tune zerolatency', // https://superuser.com/a/564404,
          '-movflags isml+frag_keyframe',
          '-f ismv',
        ])
        .format('mp4')
        .on('start', function(commandLine) {
          console.log('Transcoding started.');
          events.onStart && events.onStart(commandLine);
        })
        .on('progress', progress => {
          console.log(progress);
          events.onProgress && events.onProgress(progress);
        })
        .on('error', e => {
          console.log('Transcoding error.');
          this.status = TRANSCODER_STATUS.ERROR;
          this.command = null;
          return reject(e);
        })
        /*.on('stderr', (stderrLine) => {
          stderrLines.push(stderrLine);
        })*/
        .on('end', () => {
          console.log('Transcoding ended.');
          this.status = TRANSCODER_STATUS.ENDED;
          this.command = null;
          return resolve();
        });

        this.command.run();
    });
  }

  static setFfmpegPath() {
    let ffmpegPath = path.join(__dirname, 'vendor', 'ffmpeg-3.3.2');
    
    const platform = os.platform();
    
    if (platform === 'win32') {
      ffmpegPath += '.exe';
    }

    try {
      const stats = fs.statSync(ffmpegPath);
      ffmpeg.setFfmpegPath(ffmpegPath);
    } catch(e) {
      console.log('Missing ffmpeg executable for platform "' + platform + '" with arch "' + arch() + '". Will try to use the ffmpeg installed on the system.');
    }
  }
}

// Sync method to set Ffmpeg path, only called once for all transcoders
Transcoder.setFfmpegPath();

module.exports = Transcoder;
