var rangeParser = require('range-parser')
var fs = require('fs')

const express = require('express')

// Import transcoder from files package to transcode torrents on-the-fly
const Transcoder = require('./transcoder');

function Server (btClient) {
  const app = express();
  const port = 3000;

  app.get('/', (req, res) => {
    res.sendFile('client.html', {root: __dirname })
  })

  app.get('/:torrentHash/:fileIndex', async function (req, res) {
    const torrentHash = req.params.torrentHash;
    const fileIndex = req.params.fileIndex;

    var torrent = btClient.get(torrentHash)
    if (!torrent || Number.isNaN(fileIndex) || fileIndex >= torrent.files.length) {
      return res.sendStatus(404);
    }

    var file = torrent.files[fileIndex];

    if(req.query && 'metadata' in req.query) {
      console.log('querying metadata');
      Transcoder.getMetadata(file.createReadStream()).then((metadata) => {
        console.log('metadata', metadata);
        return res.json(metadata);
      }).catch(reason => {
        console.log(reason);
        return res.end();
      });

      return;
    }

    res.setHeader('Content-Type', 'video/mp4'); //mime.getType(file.name))

    const fileNeedsTranscoding = await Transcoder.needsTranscoding(file.createReadStream());

    /*
      File needs transcoding, so we will use time ranges instead of bytes ranges.
     */
    if(fileNeedsTranscoding) {
      // Disable range-requests in bytes
      res.setHeader('Accept-Ranges', 'none')
    
    /*
      File does not needs transcoding, so we can use byte-ranges.
     */
    } else {
      // Disable range-requests
      res.setHeader('Accept-Ranges', 'bytes')
    
      // `rangeParser` returns an array of ranges, or an error code (number) if
      // there was an error parsing the range.
      var range = rangeParser(file.length, req.headers.range || '')

      if (Array.isArray(range)) {
        res.statusCode = 206 // indicates that range-request was understood

        // no support for multi-range request, just use the first range
        range = range[0]

        res.setHeader(
          'Content-Range',
          'bytes ' + range.start + '-' + range.end + '/' + file.length
        )
        res.setHeader('Content-Length', range.end - range.start + 1)
      } else {
        range = null
        res.setHeader('Content-Length', file.length)
      }
    }

    if (req.method === 'HEAD') {
      return res.end()
    }

    if(fileNeedsTranscoding) {
      const transcoder = new Transcoder();

      const seekTime = req.query && req.query.time ? parseInt(req.query.time) : 0;

      transcoder.transcode(file.createReadStream(), res, {
        seek: seekTime,
        onStart: async () => {
          //pump(fs.createReadStream(tmpFile), res)

          // Wait for transcoding to start and file to be writen a bit before streaming it
          //await sleep(5000);

          //const readStream = GrowingFile.open(tmpFile);
          //const readStream = fs.createReadStream(tmpFile);

          //readStream.pipe(res);

          //pump(readStream, res)

          /*readStream.on('open', function () {
            // This just pipes the read stream to the response object (which goes to the client)
            //readStream.pipe(res);
            pump(readStream, res)
          });

          // This catches any errors that happen while creating the readable stream (usually invalid names)
          readStream.on('error', function(err) {
            console.log('Error', err);
            res.end();
          });*/
        },
        onProgress: (progress) => {
          console.log('Transcode progress', progress);
        },
        onError: (e) => {
          console.log('Transcode error, removing tmp file.');
          fs.unlink(tmpFile);
        }
      }).catch((reason) => {
        console.log('Transcoding error', reason);
      });
    } else {
      file.createReadStream(range).pipe(res);
    }
  })

  return app;
}

module.exports = Server
