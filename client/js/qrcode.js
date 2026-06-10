// Dependency-free QR Code generator (byte mode), self-contained and offline-safe.
// Faithful compact port of the public-domain Nayuki QR Code generator
// (https://www.nayuki.io/page/qr-code-generator-library, MIT/public domain).
// Exposes a tiny API: QRCode.renderToElement(container, text, opts).
(function (global) {
  'use strict';

  // ---- Reed-Solomon / GF(256) helpers ----
  function QrCode(version, ecl, dataCodewords, mask) {
    this.version = version;
    this.errorCorrectionLevel = ecl;
    if (version < 1 || version > 40) throw new RangeError('Version out of range');
    this.size = version * 4 + 17;
    var row = [];
    for (var i = 0; i < this.size; i++) row.push(false);
    this.modules = [];
    this.isFunction = [];
    for (var j = 0; j < this.size; j++) {
      this.modules.push(row.slice());
      this.isFunction.push(row.slice());
    }
    this.drawFunctionPatterns();
    var allCodewords = this.addEccAndInterleave(dataCodewords);
    this.drawCodewords(allCodewords);
    if (mask === -1) {
      var minPenalty = 1e9;
      for (var m = 0; m < 8; m++) {
        this.applyMask(m);
        this.drawFormatBits(m);
        var penalty = this.getPenaltyScore();
        if (penalty < minPenalty) { mask = m; minPenalty = penalty; }
        this.applyMask(m);
      }
    }
    this.mask = mask;
    this.applyMask(mask);
    this.drawFormatBits(mask);
    this.isFunction = [];
  }

  QrCode.Ecc = { LOW: 0, MEDIUM: 1, QUARTILE: 2, HIGH: 3 };
  var ECC_FORMAT = { 0: 1, 1: 0, 2: 3, 3: 2 }; // map level -> 2-bit format value

  QrCode.prototype.getModule = function (x, y) {
    return x >= 0 && x < this.size && y >= 0 && y < this.size && this.modules[y][x];
  };

  QrCode.prototype.setFunctionModule = function (x, y, isDark) {
    this.modules[y][x] = isDark;
    this.isFunction[y][x] = true;
  };

  QrCode.prototype.drawFunctionPatterns = function () {
    var size = this.size, i;
    for (i = 0; i < size; i++) {
      this.setFunctionModule(6, i, i % 2 === 0);
      this.setFunctionModule(i, 6, i % 2 === 0);
    }
    this.drawFinderPattern(3, 3);
    this.drawFinderPattern(size - 4, 3);
    this.drawFinderPattern(3, size - 4);
    var alignPatPos = this.getAlignmentPatternPositions();
    var numAlign = alignPatPos.length;
    for (i = 0; i < numAlign; i++) {
      for (var j = 0; j < numAlign; j++) {
        if (!((i === 0 && j === 0) || (i === 0 && j === numAlign - 1) || (i === numAlign - 1 && j === 0))) {
          this.drawAlignmentPattern(alignPatPos[i], alignPatPos[j]);
        }
      }
    }
    this.drawFormatBits(0);
    this.drawVersion();
  };

  QrCode.prototype.drawFormatBits = function (mask) {
    var data = (ECC_FORMAT[this.errorCorrectionLevel] << 3) | mask;
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412;
    for (var k = 0; k <= 5; k++) this.setFunctionModule(8, k, getBit(bits, k));
    this.setFunctionModule(8, 7, getBit(bits, 6));
    this.setFunctionModule(8, 8, getBit(bits, 7));
    this.setFunctionModule(7, 8, getBit(bits, 8));
    for (var j = 9; j < 15; j++) this.setFunctionModule(14 - j, 8, getBit(bits, j));
    var size = this.size;
    for (var m = 0; m < 8; m++) this.setFunctionModule(size - 1 - m, 8, getBit(bits, m));
    for (var n = 8; n < 15; n++) this.setFunctionModule(8, size - 15 + n, getBit(bits, n));
    this.setFunctionModule(8, size - 8, true);
  };

  QrCode.prototype.drawVersion = function () {
    if (this.version < 7) return;
    var rem = this.version;
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    var bits = (this.version << 12) | rem;
    for (var j = 0; j < 18; j++) {
      var bit = getBit(bits, j);
      var a = this.size - 11 + (j % 3);
      var b = Math.floor(j / 3);
      this.setFunctionModule(a, b, bit);
      this.setFunctionModule(b, a, bit);
    }
  };

  QrCode.prototype.drawFinderPattern = function (x, y) {
    for (var dy = -4; dy <= 4; dy++) {
      for (var dx = -4; dx <= 4; dx++) {
        var dist = Math.max(Math.abs(dx), Math.abs(dy));
        var xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) {
          this.setFunctionModule(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  };

  QrCode.prototype.drawAlignmentPattern = function (x, y) {
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  };

  QrCode.prototype.getAlignmentPatternPositions = function () {
    if (this.version === 1) return [];
    var numAlign = Math.floor(this.version / 7) + 2;
    var step = (this.version === 32) ? 26 :
      Math.ceil((this.version * 4 + 4) / (numAlign * 2 - 2)) * 2;
    var result = [6];
    for (var pos = this.size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  };

  // ---- ECC tables ----
  var ECC_CODEWORDS_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  ];
  var NUM_ERROR_CORRECTION_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  ];

  QrCode.prototype.addEccAndInterleave = function (data) {
    var ver = this.version, ecl = this.errorCorrectionLevel;
    var numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl][ver];
    var blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl][ver];
    var rawCodewords = Math.floor(getNumRawDataModules(ver) / 8);
    var numShortBlocks = numBlocks - rawCodewords % numBlocks;
    var shortBlockLen = Math.floor(rawCodewords / numBlocks);
    var blocks = [];
    var rsDiv = reedSolomonComputeDivisor(blockEccLen);
    for (var i = 0, k = 0; i < numBlocks; i++) {
      var dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
      k += dat.length;
      var ecc = reedSolomonComputeRemainder(dat, rsDiv);
      if (i < numShortBlocks) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var result = [];
    for (var idx = 0; idx < blocks[0].length; idx++) {
      for (var b = 0; b < blocks.length; b++) {
        if (idx !== shortBlockLen - blockEccLen || b >= numShortBlocks) {
          result.push(blocks[b][idx]);
        }
      }
    }
    return result;
  };

  QrCode.prototype.drawCodewords = function (data) {
    var size = this.size, i = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  };

  QrCode.prototype.applyMask = function (mask) {
    for (var y = 0; y < this.size; y++) {
      for (var x = 0; x < this.size; x++) {
        var invert;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = (x * y) % 2 + (x * y) % 3 === 0; break;
          case 6: invert = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break;
          case 7: invert = ((x + y) % 2 + (x * y) % 3) % 2 === 0; break;
        }
        if (!this.isFunction[y][x] && invert) this.modules[y][x] = !this.modules[y][x];
      }
    }
  };

  QrCode.prototype.getPenaltyScore = function () {
    var size = this.size, result = 0, x, y;
    for (y = 0; y < size; y++) {
      var runColor = false, runX = 0, runHistory = [0, 0, 0, 0, 0, 0, 0];
      for (x = 0; x < size; x++) {
        if (this.modules[y][x] === runColor) {
          runX++;
          if (runX === 5) result += 3;
          else if (runX > 5) result++;
        } else {
          this.finderPenaltyAddHistory(runX, runHistory);
          if (!runColor) result += this.finderPenaltyCountPatterns(runHistory) * 40;
          runColor = this.modules[y][x]; runX = 1;
        }
      }
      result += this.finderPenaltyTerminateAndCount(runColor, runX, runHistory) * 40;
    }
    for (x = 0; x < size; x++) {
      var rc = false, ry = 0, rh = [0, 0, 0, 0, 0, 0, 0];
      for (y = 0; y < size; y++) {
        if (this.modules[y][x] === rc) {
          ry++;
          if (ry === 5) result += 3;
          else if (ry > 5) result++;
        } else {
          this.finderPenaltyAddHistory(ry, rh);
          if (!rc) result += this.finderPenaltyCountPatterns(rh) * 40;
          rc = this.modules[y][x]; ry = 1;
        }
      }
      result += this.finderPenaltyTerminateAndCount(rc, ry, rh) * 40;
    }
    for (y = 0; y < size - 1; y++) {
      for (x = 0; x < size - 1; x++) {
        var c = this.modules[y][x];
        if (c === this.modules[y][x + 1] && c === this.modules[y + 1][x] && c === this.modules[y + 1][x + 1]) result += 3;
      }
    }
    var dark = 0;
    for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (this.modules[y][x]) dark++;
    var total = size * size;
    var k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * 10;
    return result;
  };

  QrCode.prototype.finderPenaltyCountPatterns = function (rh) {
    var n = rh[1];
    var core = n > 0 && rh[2] === n && rh[3] === n * 3 && rh[4] === n && rh[5] === n;
    return (core && rh[0] >= n * 4 && rh[6] >= n ? 1 : 0) + (core && rh[6] >= n * 4 && rh[0] >= n ? 1 : 0);
  };
  QrCode.prototype.finderPenaltyTerminateAndCount = function (currentColor, currentRun, rh) {
    if (currentColor) { this.finderPenaltyAddHistory(currentRun, rh); currentRun = 0; }
    currentRun += this.size;
    this.finderPenaltyAddHistory(currentRun, rh);
    return this.finderPenaltyCountPatterns(rh);
  };
  QrCode.prototype.finderPenaltyAddHistory = function (currentRunLength, rh) {
    if (rh[0] === 0) currentRunLength += this.size;
    rh.pop(); rh.unshift(currentRunLength);
  };

  // ---- Encoding ----
  function getNumRawDataModules(ver) {
    var result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  function reedSolomonComputeDivisor(degree) {
    var result = [];
    for (var i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    var root = 1;
    for (var j = 0; j < degree; j++) {
      for (var k = 0; k < result.length; k++) {
        result[k] = reedSolomonMultiply(result[k], root);
        if (k + 1 < result.length) result[k] ^= result[k + 1];
      }
      root = reedSolomonMultiply(root, 0x02);
    }
    return result;
  }
  function reedSolomonComputeRemainder(data, divisor) {
    var result = divisor.map(function () { return 0; });
    data.forEach(function (b) {
      var factor = b ^ result.shift();
      result.push(0);
      divisor.forEach(function (coef, i) { result[i] ^= reedSolomonMultiply(coef, factor); });
    });
    return result;
  }
  function reedSolomonMultiply(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xFF;
  }
  function getBit(x, i) { return ((x >>> i) & 1) !== 0; }

  // Encode UTF-8 text into a QR code at the lowest fitting version (byte mode).
  function encodeText(text, ecl) {
    var bytes = utf8ToBytes(text);
    var bitLen = bytes.length;
    for (var version = 1; version <= 40; version++) {
      var dataCapacityBits = getNumDataCodewords(version, ecl) * 8;
      var ccBits = version < 10 ? 8 : 16;
      var usedBits = 4 + ccBits + bitLen * 8;
      if (usedBits <= dataCapacityBits) {
        var bb = [];
        appendBits(4, 4, bb); // byte mode
        appendBits(bitLen, ccBits, bb);
        for (var i = 0; i < bytes.length; i++) appendBits(bytes[i], 8, bb);
        var dataCapacity = getNumDataCodewords(version, ecl) * 8;
        appendBits(0, Math.min(4, dataCapacity - bb.length), bb);
        appendBits(0, (8 - bb.length % 8) % 8, bb);
        var padByte = 0xEC;
        while (bb.length < dataCapacity) { appendBits(padByte, 8, bb); padByte ^= 0xEC ^ 0x11; }
        var dataCodewords = [];
        for (var k = 0; k < bb.length; k += 8) {
          var byte = 0;
          for (var b = 0; b < 8; b++) byte = (byte << 1) | bb[k + b];
          dataCodewords.push(byte);
        }
        return new QrCode(version, ecl, dataCodewords, -1);
      }
    }
    throw new RangeError('Data too long');
  }
  function getNumDataCodewords(ver, ecl) {
    return Math.floor(getNumRawDataModules(ver) / 8) -
      ECC_CODEWORDS_PER_BLOCK[ecl][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl][ver];
  }
  function appendBits(val, len, bb) {
    for (var i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
  }
  function utf8ToBytes(str) {
    var utf8 = unescape(encodeURIComponent(str));
    var bytes = [];
    for (var i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i));
    return bytes;
  }

  // ---- Public render helper (SVG output, crisp at any size) ----
  function renderToElement(container, text, opts) {
    opts = opts || {};
    var border = opts.border == null ? 2 : opts.border;
    var dark = opts.dark || '#0b1020';
    var light = opts.light || '#ffffff';
    var qr;
    try {
      qr = encodeText(text, QrCode.Ecc[opts.ecc] || QrCode.Ecc.MEDIUM);
    } catch (e) {
      container.textContent = 'QR indisponible';
      return false;
    }
    var size = qr.size + border * 2;
    var parts = [];
    for (var y = 0; y < qr.size; y++) {
      for (var x = 0; x < qr.size; x++) {
        if (qr.getModule(x, y)) parts.push('M' + (x + border) + ',' + (y + border) + 'h1v1h-1z');
      }
    }
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size +
      '" stroke="none" shape-rendering="crispEdges" width="100%" height="100%">' +
      '<rect width="100%" height="100%" fill="' + light + '"/>' +
      '<path d="' + parts.join(' ') + '" fill="' + dark + '"/></svg>';
    container.innerHTML = svg;
    return true;
  }

  global.QRCode = { encodeText: encodeText, renderToElement: renderToElement, Ecc: QrCode.Ecc };
})(typeof window !== 'undefined' ? window : this);
