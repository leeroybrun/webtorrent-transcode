
// HTTP server used to stream and transcode torrent files on-the-fly
// The base has been taken from https://github.com/webtorrent/webtorrent/blob/master/lib/server.js and modified to implement transcoding.

var arrayRemove = require('unordered-array-remove')
var http = require('http')
var mime = require('mime')
var pump = require('pump')
var rangeParser = require('range-parser')
var url = require('url')
const { v4: uuidv4 } = require('uuid');
var os = require('os')
var path = require('path')
var fs = require('fs')

// Import transcoder from files package to transcode torrents on-the-fly
const Transcoder = require('./transcoder');

function Server (btClient, opts) {
  var server = http.createServer()
  if (!opts) opts = {}
  if (!opts.origin) opts.origin = '*' // allow all origins by default

  var sockets = []
  var closed = false
  const transcoder = new Transcoder();

  server.on('connection', onConnection)
  server.on('request', onRequest)

  var _close = server.close
  server.close = function (cb) {
    closed = true
    server.removeListener('connection', onConnection)
    server.removeListener('request', onRequest)
    btClient = null
    _close.call(server, cb)
  }

  server.destroy = function (cb) {
    sockets.forEach(function (socket) {
      socket.destroy()
    })

    // Only call `server.close` if user has not called it already
    if (!cb) cb = function () {}
    if (closed) process.nextTick(cb)
    else server.close(cb)
  }

  function isOriginAllowed (req) {
    // When `origin` option is `false`, deny all cross-origin requests
    if (opts.origin === false) return false

    // Requests without an 'Origin' header are not actually cross-origin, so just
    // deny them
    if (req.headers.origin == null) return false

    // The user allowed all origins
    if (opts.origin === '*') return true

    // Allow requests where the 'Origin' header matches the `opts.origin` setting
    return req.headers.origin === opts.origin
  }

  function onConnection (socket) {
    socket.setTimeout(36000000)
    sockets.push(socket)

    // TODO: find a way to identify users and have one instance of Transcoder/user
    socket.id = uuidv4();
    
    socket.once('close', function () {
      console.log('close socket');
      arrayRemove(sockets, sockets.indexOf(socket))
      //transcoder.killProcess();
    })
  }

  function onRequest (req, res) {
    console.log('socket id', req.socket.id);
    var parsedUrl = url.parse(req.url, true);
    var pathname = parsedUrl.pathname
    var queryString = parsedUrl.query

    console.log(req.method +' request '+ req.url);

    if (pathname === '/favicon.ico') {
      return serve404Page()
    }

    // Allow cross-origin requests (CORS)
    if (isOriginAllowed(req)) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin)
    }

    // Prevent browser mime-type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff')

    // Allow CORS requests to specify arbitrary headers, e.g. 'Range',
    // by responding to the OPTIONS preflight request with the specified
    // origin and requested headers.
    if (req.method === 'OPTIONS') {
      if (isOriginAllowed(req)) return serveOptionsRequest()
      else return serveMethodNotAllowed()
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      handleRequest()
      return
    }

    return serveMethodNotAllowed()

    function serveOptionsRequest () {
      res.statusCode = 204 // no content
      res.setHeader('Access-Control-Max-Age', '600')
      res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE')

      if (req.headers['access-control-request-headers']) {
        res.setHeader(
          'Access-Control-Allow-Headers',
          req.headers['access-control-request-headers']
        )
      }
      res.end()
    }

    function onReady () {
      arrayRemove(pendingReady, pendingReady.indexOf(onReady))
      handleRequest()
    }

    function handleRequest () {
      if (pathname === '/') {
        return serveIndexPage()
      }

      var torrentHash = pathname.split('/')[1]
      var fileIndex = Number(pathname.split('/')[2])
      var torrent = btClient.get(torrentHash)
      if (!torrent || Number.isNaN(fileIndex) || fileIndex >= torrent.files.length) {
        return serve404Page()
      }

      var file = torrent.files[fileIndex]
      serveFile(file)
    }

    function serveIndexPage () {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html')

      fs.readFile(path.join(__dirname, 'client.html'), (error, content) => {
        if (error) {
          response.writeHead(500);
          return response.end(''+ error);
        }

        return res.end(content)
      });
    }

    function serve404Page () {
      res.statusCode = 404
      res.setHeader('Content-Type', 'text/html')

      res.end()
    }

    function sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function serveFile (file) {
      res.statusCode = 200

      if(queryString && 'metadata' in queryString) {
        console.log('querying metadata');
        Transcoder.getMetadata(file.createReadStream()).then((metadata) => {
          console.log('metadata', metadata);
          return res.end(JSON.stringify(metadata));
        }).catch(reason => {
          console.log(reason);
          return res.end();
        });

        return;
      }

      res.setHeader('Content-Type', 'video/mp4'); //mime.getType(file.name))

      const fileNeedsTranscoding = await Transcoder.needsTranscoding(file.createReadStream());

      // Set name of file (for "Save Page As..." dialog)
      /*res.setHeader(
        'Content-Disposition',
        'inline; filename*=UTF-8\'\'' + encodeRFC5987(file.name)
      )*/

      /*/ Support DLNA streaming
      res.setHeader('transferMode.dlna.org', 'Streaming')
      res.setHeader(
        'contentFeatures.dlna.org',
        'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000'
      )*/

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
        // Cannot use stream as input and output as it can cause deadlocks in Node.js. (https://github.com/fluent-ffmpeg/node-fluent-ffmpeg/issues/380)
        const tmpFile = path.join(os.tmpdir(), 'webtorrent-otf-transcode.mp4');

        const seekTime = queryString && queryString.time ? parseInt(queryString.time) : 0;

        transcoder.transcode(file.createReadStream(), res, {
          seek: seekTime,
          onStart: async () => {
            //pump(fs.createReadStream(tmpFile), res)

            // Wait for transcoding to start and file to be writen a bit before streaming it
            await sleep(5000);

            //const readStream = GrowingFile.open(tmpFile);
            const readStream = fs.createReadStream(tmpFile);

            //readStream.pipe(res);

            pump(readStream, res)

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
        pump(file.createReadStream(range), res)
      }
    }

    function serveMethodNotAllowed () {
      res.statusCode = 405
      res.setHeader('Content-Type', 'text/html')
      var html = getPageHTML('405 - Method Not Allowed', '<h1>405 - Method Not Allowed</h1>')
      res.end(html)
    }
  }

  return server
}

// From https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent
function encodeRFC5987 (str) {
  return encodeURIComponent(str)
    // Note that although RFC3986 reserves "!", RFC5987 does not,
    // so we do not need to escape it
    .replace(/['()]/g, escape) // i.e., %27 %28 %29
    .replace(/\*/g, '%2A')
    // The following are not required for percent-encoding per RFC5987,
    // so we can allow for a little better readability over the wire: |`^
    .replace(/%(?:7C|60|5E)/g, unescape)
}

module.exports = Server
