const picture = module.exports;

const dateFormat    = require('dateformat');
const exec          = require('child_process').exec;
const fs            = require('fs');
const mkdirp        = require('mkdirp-promise');

var picturePath;
var pictureSuffix;
var pemFile;
var cloudUser;
var cloudUrl;

// filesByDirFolder
//   Input:  path, folder
//   Output:  promise that resolves to an array of folder/filename
function filesByDirFolder (path, folder) {
  return new Promise((resolve, reject) => {
    let pathDir = path + '/' + folder;
    fs.readdir (pathDir, function(err, items) {
      if (err) {
        reject(err);
      }
      else {
        let files = [];

        if (items) {
          for (let i = 0; i < items.length; i++) {
            files.push(folder + '/' + items[i]);
          }
        }
        resolve(files);
      }
    });
  });
};

// Init routes
picture.init = (env, router) => {
  picturePath = env.PICTURE_PATH;
  pictureSuffix = env.PICTURE_SUFFIX;
  pemFile = env.PEM_FILE;
  cloudUser = env.CLOUD_USER;
  cloudUrl = env.CLOUD_URL;
  if (!fs.existsSync(picturePath)) {
    fs.mkdirSync(picturePath);
  }
  router.post('/picture', picture.takePicture.bind(this));
  router.delete('/picture/:directory', picture.deletePictureDirectory.bind(this));
  router.put('/picture/:directory', picture.rsyncPictureDirectory.bind(this));
};

// Take picture, return path to picture
// body = {
//   directory: path, // required
//   base_name: name, // optional
//   options: {       // optional
//     key: value
//   }
// }
picture.takePicture = (req) => {
  console.log('takePicture req.body = ' + JSON.stringify(req.body, null, 2));
  if (!req.body.directory) {
    throw new Error('request body needs directory');
  }

  let pathDir = picturePath + '/' + req.body.directory;
  let pathName;

  return mkdirp(pathDir) // returns Promise
  .then((data) => { // data is not used here
    let nameBase = 'camera';
    if (req.body.name) {
      nameBase = req.body.name;
    }
    let d = new Date();
    let dateSuffix = dateFormat(d, 'hMMss');
    let name = nameBase + dateSuffix + pictureSuffix;
    pathName = pathDir + '/' + name;

    let options = '';
    if (req.body.options) {
      if (Object.keys(req.body.options).length > 0) {
        options += Object.keys(req.body.options).map (function(k) {
          let dashes = k.length <= 3 ? '-' : '--';
          return dashes + k + ' ' + req.body.options[k]; 
        }).join(' ');
      }
    }

    return new Promise((resolve, reject) => {
      exec (
        'raspistill ' + options + ' -o ' + pathName, function(err, data, stderr) {
          if (err) {
            reject(err.message.error);
          }   
          else {
            let obj = {};
            obj.name = name;
            obj.directory = req.body.directory;
            resolve(obj);
          }   
        }   
      );  
    });
  })
  .catch(function(err) {
    return 'Error' + (err ? `: ${err}` : '');
  });
};

picture.rsyncPictureDirectory = (req) => {
  console.log(`rsyncPictureDirectory: ${req.params.directory}`);
  let pathDir = `${picturePath}/${req.params.directory}`;
  return new Promise((resolve, reject) => {
    fs.access(pathDir, fs.F_OK, (err) => {
      if (err) {
        reject(err);
      }
      else {
        resolve(true);
      }
    });
  })
  .then((fExists) => {
    return new Promise((resolve, reject) => {
      if (!fExists) {
        resolve();
      }
      else {
        let cmd = 'rsync -a -rave "ssh -i ' + pemFile + '" ' + 
          pathDir +
          ' ' + cloudUser + '@' + cloudUrl + ':~/apps/cloud-node/dist/assets/customer-photos';
//        console.log('cmd = ' + cmd);
        exec (cmd,
          function(err, data, stderr) {
            if (err) {
              reject(err.message.error);
            }   
            else {
              resolve();
            }   
          }   
        );  
      }
    });
  })
  .then(() => {
    return filesByDirFolder(picturePath, req.params.directory);
  })
  .then((files) => {
    return new Promise((resolve, reject) => {
      let obj = {};
      obj.files = files;
      resolve(obj);
    });
  })
  .catch((err) => {
    return 'Error' + (err ? `: ${err}` : '');
  });
};

picture.deletePictureDirectory = (req) => {
  console.log(`deletePictureDirectory: ${req.params.directory}`);
  let pathDir = `${picturePath}/${req.params.directory}`;

  return new Promise((resolve, reject) => {
    fs.access(pathDir, fs.F_OK, (err) => {
      if (err) {
        reject(err);
      }
      else {
        resolve(true);
      }
    });
  })
  .then((fExists) => {
    return new Promise((resolve, reject) => {
      if (!fExists) {
        resolve();
      }
      else {
        exec (
          'rm -r ' + pathDir, function(err, data, stderr) {
            if (err) {
              reject(err.message.error);
            }   
            else {
              resolve();
            }   
          }   
        );  
      }
    });
  })
  .catch(function(err) {
    return 'Error' + (err ? `: ${err}` : '');
  });
};

picture.deleteAllPictures = () => {
  console.log('deleteAllPictures');
  let pathDir = picturePath;
  return new Promise((resolve, reject) => {
    exec (
      'rm -r ' + pathDir, function(err, data, stderr) {
        if (err) {
          reject(err.message.error);
        }   
        else {
          resolve();
        }   
      }   
    );  
  }).
  then(() => {
    return mkdirp(pathDir) // returns Promise
  })
  .catch(function(err) {
    return 'Error' + (err ? `: ${err}` : '');
  });
};
