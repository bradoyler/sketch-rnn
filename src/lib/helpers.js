
const Create2DArray = function (rows, cols) {
  var arr = []

  for (var i = 0; i < rows; i++) {
    arr[i] = new Array(cols)
  }

  return arr
}

module.exports = {
  Create2DArray
}
