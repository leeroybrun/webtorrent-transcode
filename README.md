# webtorrent-transcode
Attempt to transcode and stream torrents downloaded with WebTorrent using FFmpeg

## Work to do

- [ ] Seeking
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

- [ ] Real duration of video
      Duration of video is not working in HTML5 player. 
      The video appears to be only 10 seconds, and sometimes when we arrive at the end, it get 10 more seconds, etc.
      - Get video duration :
          - https://superuser.com/a/945604
      - Set duration in Video.js
- [ ] Transcode only what is needed
      MKV may need only audio to be transcoded?
      - https://www.reddit.com/r/Chromecast/comments/22wbge/videostream_now_supports_all_file_formats/cgrc8og/
- [ ] Use static ffmpeg?
      - https://github.com/eugeneware/ffmpeg-static
      - https://github.com/joshwnj/ffprobe-static

## Resources

- See example of HLS VOD : https://github.com/mifi/hls-vod
- Castnow transcoding rework: 
    - https://github.com/xat/castnow/issues/32
    - https://github.com/xat/castnow/issues/58
- Ffmpeg live streaming :
    - https://github.com/unifiedstreaming/live-demo/tree/master/ffmpeg
- Headers for HTTP streaming
    - https://gist.github.com/CMCDragonkai/6bfade6431e9ffb7fe88#content-length