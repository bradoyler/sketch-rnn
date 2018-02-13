
const Create2DArray = function (rows, cols) {
  var arr = []

  for (var i = 0; i < rows; i++) {
    arr[i] = new Array(cols)
  }

  return arr
}

const insideBox = function (x, y, outsize) {
  if (x > 0 && y > 0 && x < outsize && y < outsize) {
    return true
  }
  return false
}

module.exports = {
  Create2DArray,
  insideBox
}
