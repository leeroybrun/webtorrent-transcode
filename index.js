const path = require('path');

const WebTorrent = require('webtorrent');
const TorrentFilesServer = require('./server-express');
const port = 3333;

const client = new WebTorrent();

// Start the fileserver to stream/transcode files on-the-fly
const filesServer = new TorrentFilesServer(client);
filesServer.listen(port, () => {
  console.log('Started torrent files server on port '+ port);
});

// Tears of Steal - MKV version
client.add(path.join(__dirname, 'torrents', 'tears_of_steel_1080p.mkv.torrent'), (torrent) => {
  console.log('Torrent '+ torrent.infoHash +' added.');

  torrent.on('done', () => {
    console.log('Torrent '+ torrent.infoHash +' done.');
  })
});