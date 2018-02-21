const functions = require('firebase-functions');
const gcs = require('@google-cloud/storage')({
  keyFilename: 'youaktion-app-firebase-adminsdk-0scsm-b928a1bb30.json',
});
const spawn = require('child-process-promise').spawn;
const admin = require('firebase-admin');

admin.initializeApp(functions.config().firebase);

exports.generateThumbnail = functions.storage.object()
  .onChange(event => {
    const object = event.data;
    const filePath = object.name;
    const fileName = filePath.split('/').pop();
    const fileBucket = object.bucket;
    const bucket = gcs.bucket(fileBucket);
    const tempFilePath = `/tmp/${fileName}`;
    const refMedia = admin.database().ref('/Media');
    const file = bucket.file(filePath);
    let thumbFileUrl = null;
    let thumb500Key = null;
    // eslint-disable-next-line
    const thumbFilePath = filePath.replace(/(\/)?([^\/]*)$/, '$1thumb_500_$2');

    if (fileName.startsWith('thumb_')) {
      console.log('Already a thumbnail!');
      return;
    }

    if (!object.contentType.startsWith('image/')) {
      console.log('A non image file has been uploaded!');
      return;
    }

    if (object.resourceState === 'not_exists') {
      console.log('This is deletion event!');
      return;
    }

    return bucket.file(filePath).download({
      destination: tempFilePath,
    }).then(() => {
      console.log(`Image downloaded locally to ${tempFilePath}`);
      return spawn('convert', [tempFilePath, '-thumbnail', '500x500>', tempFilePath]);
    }).then(() => {
      console.log('Thumbnail created');
      return bucket.upload(tempFilePath, {
        destination: thumbFilePath,
        metadata: {
          metadata: {
            mediaType: 'image:thumb:500',
          },
        },
      });
    }).then(() => {
      console.log('Thumbnail uploaded');
      const thumbFile = bucket.file(thumbFilePath);
      const config = {
        action: 'read',
        expires: '03-09-3696',
      };
      return Promise.all([
        thumbFile.getSignedUrl(config),
        file.getMetadata(),
      ]);
    }).then(results => {
      const thumbResult = results[0];
      const originalFileResult = results[1];
      thumbFileUrl = thumbResult[0];
      const { metadata } = originalFileResult[0];
      thumb500Key = metadata.ownKey;
      console.log('Media own key', thumb500Key);

      return refMedia.child(thumb500Key).once('value');
    }).then((snapshot)=> {
      const value = snapshot.val();
      if (value) {
        return refMedia.child(thumb500Key).update({
          'url:thumb:500': thumbFileUrl,
        });
      }
      return Promise.resolve();
    });
  });
