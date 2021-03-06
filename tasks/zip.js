const zopfli = require('node-zopfli-es')
const fs = require('fs')
const path = require('path')

const log = require('../log')
const conf = require('../config')()

const walk = (dir, done) => {
  let results = []
  fs.readdir(dir, function(err, list) {
    if (err) {
      return done(err)
    }

    let pending = list.length

    if (pending === 0) {
      return done(null, results)
    }

    list.forEach(file => {
      file = path.resolve(dir, file)
      fs.stat(file, function(err, stat) {
        if (stat && stat.isDirectory()) {
          walk(file, (err, res) => {
            results = results.concat(res)

            pending -= 1
            if (pending === 0) {
              done(null, results)
            }
          })
        } else {
          results.push(file)
          pending -= 1
          if (pending === 0) {
            done(null, results)
          }
        }
      })
    })
  })
}

// simply tests if a file ends with .gz
const fileEndsWith = file => suffix =>
  file.indexOf(suffix) === file.length - suffix.length


// compress a single file
const zipFile = file => {
  // do not run for files we can compress with imagemin
  if (['.gz', 'CNAME'].some(fileEndsWith(file))) {
    return
  }

  return new Promise((resolve, reject) => {
    const gzFileName = `${file}.gz`
    const options = {
      verbose: false,
      verbose_more: false,
      numiterations: 15,
      blocksplitting: true,
      blocksplittinglast: false,
      blocksplittingmax: 15,
    }
    const zopferl = zopfli.createGzip(options)
    const writeStream = fs.createWriteStream(gzFileName)

    const readStream = fs.createReadStream(file)
      .pipe(zopferl)
      .pipe(writeStream)

    readStream.on('error', reject)
    writeStream.on('error', reject)
    writeStream.on('close', () => {
      const [gzSize, origSize] = [gzFileName, file].map(f => fs.statSync(f).size)
      if (gzSize > origSize) {
        // gzip is bigger than original, delete gzipped file
        log.warn(file, 'gzipped files is bigger than original. deleting .gz')
        fs.unlinkSync(gzFileName)
      }
      resolve()
    })
  })
}

// main task, compresses all files in the public dir
const zip =
  () =>
    new Promise((resolve, reject) => {
      if (!conf.TASKS.ZIP) {
        resolve()
        return
      }

      walk(conf.OUT_DIR, (err, files) => {
        if (err) {
          log.error(err)
          return
        }

        const promises = files.map(zipFile)
        Promise.all(promises)
               .then(() => {
                 console.log('zipping finished')
                 resolve()
               })
               .catch(reject)
      })
    })

module.exports = zip
