'use strict';
var q = require('q'),
    fs = require('fs'),
    path = require('path'),
    _ = require('lodash'),

    Image = require('./image'),

    GeminiError = require('./errors/gemini-error'),
    looksSame = require('looks-same'),
    clientScriptCalibrate = fs.readFileSync(path.join(__dirname, 'browser', 'client-scripts', 'gemini.calibrate.js'), 'utf8');

/**
 * @constructor
 */
function Calibrator() {
    this._cache = {};
}

/**
 * @param {Browser} browser
 * @returns {Promise.<CalibrationResult>}
 */
Calibrator.prototype.calibrate = function(browser) {
    var _this = this;
    if (this._cache[browser.id]) {
        return q(this._cache[browser.id]);
    }
    return browser.open('about:blank')
        .then(function() {
            return browser.evalScript(clientScriptCalibrate);
        })
        .then(function(features) {
            return [features, browser.captureFullscreenImage()];
        })
        .spread(function(features, image) {
            var searchColor = {R: 148, G: 250, B: 0},
                imageSize = image.getSize(),
                minLength = 6,
                start = null,
                currentLength = 0;

            outer: for (var y = 0; y < imageSize.height; y++) {
                for (var x = 0; x < imageSize.width; x++) {
                    var color = pickRGB(image.getRGBA(x, y));
                    if (looksSame.colors(color, searchColor)) {
                        currentLength++;
                        if (!start) {
                            start = {x: x, y: y};
                        }
                    } else if (currentLength >= minLength) {
                        break outer;
                    } else {
                        if (currentLength > 0) {
                            console.log(Image.RGBToString(image.getRGBA(x, y)));
                        }
                        currentLength = 0;
                        start = null;
                    }
                }
            }

            if (!start) {
                return q.reject(new GeminiError(
                    'Could not calibrate. This could be due to calibration page has failed to open properly'
                ));
            }

            _.extend(features, {
                top: start.y,
                left: start.x,
                usePixelRatio: (features.pixelRatio &&
                    features.pixelRatio > 1.0 &&
                    currentLength > minLength
                )
            });

            _this._cache[browser.id] = features;
            return features;
        });
};

function pickRGB(rgba) {
    return {
        R: rgba.r,
        G: rgba.g,
        B: rgba.b
    };
}

/**
 * @typedef {Object} CalibrationResult
 * @property {Number} top
 * @property {Number} left
 * @property {Number} right
 * @property {Number} bottom
 */

module.exports = Calibrator;
