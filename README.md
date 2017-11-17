# webtorrent-transcode
Attempt to transcode and stream torrents downloaded with WebTorrent using FFmpeg

## How to use

- Download ffmpeg/ffprobe from https://ffmpeg.zeranoe.com/builds/
- Place the executable files in the vendor/folder
- Install dependencies
  `yarn`
- Run the server
  `node index.js`
- Access it on http://localhost:3333/
- The demo torrent (Tears of Steel - MKV) will play on a Video.js player

## So, how does it works?

- On-the-fly transcoding with ffmpeg
  We check if the file needs transcoding, if not, we stream it directly from WebTorrent to the client.
  In this case, we accept byte-ranges requests to seek inside the media.

  If the file needs transcoding, we pass directly the stream from the WebTorrent file (`file.createReadStream()`) to fluent-ffmpeg.
  In this case, we disable byte-ranges requests as we need to seek by time-ranges directly with ffmpeg.
  Time-ranges are implemented by a ?time=SS URL parameter.
  To support time-ranges on the HTML5 player, we use a custom plugin for Video.js (TimeRangesSeeking).

  As the duration of the video is not known, we have a custom plugin for Video.js to handle querying it on the server (which use ffprobe). The duration is then set in Video.js.

- Plugins for Video.js
    - Time-ranges seeking
      When we move the SeekBar of Video.js, we then send a request to the server with our new time-range.
      We then change the source on the player, and save the time offset (our new time range).
      When we display the progress, we use the time offset (where we have seeked) + currentTime of the player.

    - Media duration querying
      When transcoding, we don't know the duration of the video.
      We query the server with the ?metadata URL query to get if from ffprobe.
      We then force it on the player.

## Todo

- [ ] Real duration?
      Video.js does display which duration?
      Does .duration() should be the remaining duration, or total duration?
- [ ] Green artifacts when seeking
      Green artifacts are apperaing when seeking.
      Once the image change/camera move, the green parts are replaced with the real images.
- [ ] Transcode only what is needed
      MKV may need only audio to be transcoded?
      - https://www.reddit.com/r/Chromecast/comments/22wbge/videostream_now_supports_all_file_formats/cgrc8og/
- [ ] Use static ffmpeg?
      - https://github.com/eugeneware/ffmpeg-static
      - https://github.com/joshwnj/ffprobe-static
- [x] Seeking
      Seeking does not works now as transcoding is implemented.
      We should not seek with createReadStream but directly with ffmpeg.
      We have multiple options to do this:
      - Transcode video from the start, save in tmp file, seek directly from fs in tmp file.
          - Advantages:
              - Seek working directly from HTML5 player/HTTP Accept-Ranges/bytes
          - Disavantages:
              - Cannot seek further than what has already been transcoded
      - Transcode on-the-fly, save in tmp file, seek with ffmpeg (restart the ffmpeg process everytime we seek)
          - Advantages:
              - Can seek at anytime in the video
          - Disavantages:
              - Need to convert bytes ranges to time ranges for Ffmpeg (how?) or hack HTML5 player to request time ranges
          - So, how?
              - Convert bytes ranges to time ranges. Need a fixed bitrate.
              - Hack HTML5 player to ask for time ranges instead of bytes ranges (https://www.w3.org/2008/WebVideo/Fragments/wiki/Time_Range_units)
                  - Video.js plugin to seek with time query parameter https://github.com/aervans/videojs-seek
                  - Disable bytes ranges on the server side when transcoding (still enable it when file does not need transcoding)
              - We can also store the time-range that is already converted in the tmp file and serve it from here, without restarting ffmpeg process
              - Media Fragments?
                  - https://www.sitepoint.com/html5-video-fragments-captions-dynamic-thumbnails/
                  - https://www.w3.org/2008/WebVideo/Fragments/code/plugin/demos/
                  - https://github.com/pasqLisena/maffin
                  - https://www.slideshare.net/SquaLeLis/developing-a-nodejs
                  - https://simpl.info/mediafragments/
                  - http://www.annodex.net/~silvia/itext/mediafrag.html
              - Custom Video.js seekbar
                  - http://docs.videojs.com/docs/api/seek-bar.html
                  - https://github.com/fluent-ffmpeg/node-fluent-ffmpeg/issues/418#issuecomment-116478597
              - Test with Videojs :
                  - https://codepen.io/leeroybrun/pen/yPzjEL
                  - Seekbar: https://github.com/videojs/video.js/blob/v6.4.0/src/js/control-bar/progress-control/seek-bar.js
                  - Player: https://github.com/videojs/video.js/blob/v6.4.0/src/js/player.js
                  - HTML5 tech: https://github.com/videojs/video.js/blob/v6.4.0/src/js/tech/html5.js
              - Resolution switcher (change source, but keep progress/time/duration)
                  - https://github.com/kmoskwiak/videojs-resolution-switcher#updatesrcsource
                  - https://github.com/kmoskwiak/videojs-resolution-switcher/blob/master/lib/videojs-resolution-switcher.js#L152

          - References
              - https://github.com/xat/chromecast-scanner/issues/2#issuecomment-69494722
              - https://github.com/xat/chromecast-scanner/issues/2#issuecomment-69495336
              - https://superuser.com/questions/349590/how-can-i-find-out-how-big-my-encoded-file-will-be
              - VideoStream (transcode on-the-fly all formats) : https://chrome.google.com/webstore/detail/videostream-for-google-ch/cnciopoikihiagdjbjpnocolokfelagl?hl=en

- [x] Real duration of video
      Duration of video is not working in HTML5 player. 
      The video appears to be only 10 seconds, and sometimes when we arrive at the end, it get 10 more seconds, etc.
      - Get video duration :
          - https://superuser.com/a/945604
      - Set duration in Video.js

## Resources

- See example of HLS VOD : https://github.com/mifi/hls-vod
- Castnow transcoding rework: 
    - https://github.com/xat/castnow/issues/32
    - https://github.com/xat/castnow/issues/58
- Ffmpeg live streaming :
    - https://github.com/unifiedstreaming/live-demo/tree/master/ffmpeg
- Headers for HTTP streaming
    - https://gist.github.com/CMCDragonkai/6bfade6431e9ffb7fe88#content-length