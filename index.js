const path = require('path');

const WebTorrent = require('webtorrent');
const TorrentFilesServer = require('./server');

const client = new WebTorrent();

// tart the fileserver to stream/transcode files on-the-fly
const filesServer = new TorrentFilesServer(client);
filesServer.listen(3333, () => {
  const port = filesServer.address().port;

  console.log('Started torrent files server on port '+ port);
});

// Tears of Steal - MKV version
client.add(path.join(__dirname, 'torrents', 'tears_of_steel_1080p.mkv.torrent'), (torrent) => {
  console.log('Torrent '+ torrent.infoHash +' added.');

  torrent.on('done', () => {
    console.log('Torrent '+ torrent.infoHash +' done.');
  })
});