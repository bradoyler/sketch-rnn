/* globals ModelImporter, SketchRNN, DataTool */
const { largeClassList, smallClassList } = require('./models/lists')
const { Create2DArray, insideBox } = require('./lib/helpers')
const modelRawData = JSON.stringify(require('./models/bicycle.gen.json'))

module.exports = function (p) {
  const useLargeModels = false
  const classList = useLargeModels ? largeClassList : smallClassList
  const Nsize = 2 // output will be a matrix of Nsize x Nsize;
  const lineWidth = 1.0
  const minSequenceLength = 5

  let screenWidth
  let screenHeight
  let originX
  let originY
  let insize
  let outsize

  // input variables:
  let dx
  let dy // offsets of the pen strokes, in pixels
  let pen = 0
  let prevPen = 1
  let x
  let y // absolute coordinates on the screen of where the pen is
  let startX
  let startY
  let hasStarted = false // set to true after user starts writing.
  let justFinishedLine = false
  let epsilon = 2 // to ignore data from user's pen staying in one spot.
  let rawLines
  let currentRawLine
  let currentRawLineSimple
  let strokes
  let rawStrokes
  let stroke
  let rawStroke
  let lastPoint
  let idx
  let lineColor
  let rawLineColor
  let predictLineColor

  // model related
  let sketchModel
  let modelData
  let temperature = 0.25
  const screen_scale_factor = 3.0
  let asyncDraw = true

  // individual models (2d arrays)
  let modelState
  let modelX
  let modelY
  let modelDX
  let modelDY
  let modelIsActive
  let modelSteps
  let modelPrevPen

  // TODO: add model object
  // const model = { state, x, y }

  // dom
  let canvas
  let resetButton
  let modelSelection
  let textInstruction
  let randomModelButton
  let predictButton
  let textTitle
  let titleText = 'Draw a Bicycle...'

  const drawExample = function (example, startX, startY, lineColor, lineThickness) {
    let x = startX
    let y = startY
    let penDown, penUp, penEnd
    let prevPen = [0, 0, 0]
    let theLineThickness = 1.0

    if (typeof lineThickness === 'number') {
      theLineThickness = lineThickness
    }

    for (let i = 0; i < example.length; i++) {
      // sample the next pen's states from our probability distribution
      [dx, dy, penDown, penUp, penEnd] = example[i]

      if (prevPen[2] === 1) { // end of drawing.
        break
      }

      // only draw on the paper if the pen is touching the paper
      if (prevPen[0] === 1) {
        p.stroke(lineColor)
        p.strokeWeight(theLineThickness)
        p.line(x, y, (x + dx), (y + dy)) // draw line connecting prev point to current point.
      }

      // update the absolute coordinates from the offsets
      x += dx
      y += dy

      // update the previous pen's state to the current one we just sampled
      prevPen = [penDown, penUp, penEnd]
    }
  }

  const init = function () {
    originX = Create2DArray(Nsize, Nsize)
    originY = Create2DArray(Nsize, Nsize)
    screenWidth = Math.max(window.innerWidth, 480)
    screenHeight = Math.max(window.innerHeight, 320)

    insize = screenWidth / 2
    outsize = screenWidth / (2 * Nsize)
    ModelImporter.set_init_model(modelRawData)

    if (useLargeModels) {
      ModelImporter.set_model_url('https://storage.googleapis.com/quickdraw-models/sketchRNN/large_models/')
    }

    modelData = ModelImporter.get_model_data()

    sketchModel = new SketchRNN(modelData)
    sketchModel.set_pixel_factor(screen_scale_factor)

    canvas = p.createCanvas(screenWidth, screenHeight)
    canvas.position(0, 0)

    p.frameRate(40)
    p.background(255, 255, 255, 255)

    // individual models:
    modelState = Create2DArray(Nsize, Nsize)
    modelX = Create2DArray(Nsize, Nsize)
    modelY = Create2DArray(Nsize, Nsize)
    modelDX = Create2DArray(Nsize, Nsize)
    modelDY = Create2DArray(Nsize, Nsize)
    modelIsActive = Create2DArray(Nsize, Nsize)
    modelSteps = Create2DArray(Nsize, Nsize)
    modelPrevPen = Create2DArray(Nsize, Nsize)

    // select box
    modelSelection = p.createSelect()
    for (let i = 0; i < classList.length; i++) {
      modelSelection.option(classList[i])
    }
    modelSelection.class('form-control')
    modelSelection.style('max-width', 120)
    modelSelection.position(95, insize - 25)
    modelSelection.changed(modelSelected)

    // dom
    resetButton = p.createButton('Clear')
    resetButton.class('btn btn-primary')
    resetButton.position(5, insize - 25)
    resetButton.touchStarted(resetButtonEvent) // attach button listener

    // random model buttom
    randomModelButton = p.createButton('Random')
    randomModelButton.class('btn btn-primary')
    randomModelButton.position(240, insize - 25)
    randomModelButton.touchStarted(randomButtonEvent) // attach button listener

    // predict button
    predictButton = p.createButton('Re-Draw')
    predictButton.class('btn btn-primary')
    predictButton.position(325, insize - 25)
    predictButton.touchStarted(predictEvent) // attach button listener

    // text descriptions
    textInstruction = p.createP('')
    textInstruction.style('font-family', 'monospace')
    textInstruction.position(10, insize - 60)

    textTitle = p.createElement('h3', titleText)
    textTitle.style('font-family', 'Helvetica')
    textTitle.style('font-size', '18')
    textTitle.style('color', '#3393d1') // ff990a
    textTitle.position(10, -5)
  }

  const resetText = function () {
    var class_name = sketchModel.name
    class_name = class_name.split('_').join(' ')
    textInstruction.html('draw partial ' + class_name + '.')
  }

  const redrawScreen = function () {
    var i, j

    p.background(255, 255, 255, 255)
    p.fill(255, 255, 255, 255)

    resetText()

    for (i = 0; i < Nsize; i++) {
      for (j = 0; j < Nsize; j++) {
        originX[i][j] = j * outsize + screenWidth / 2
        originY[i][j] = i * outsize
      }
    }

    p.stroke(0.25)
    p.strokeWeight(0.25)
    p.rect(1, 1, screenWidth - 1, screenWidth / 2 - 1)

    for (i = 0; i < Nsize; i++) {
      p.line(screenWidth / 2 + outsize * i - 1, 1, screenWidth / 2 + outsize * i - 1, screenWidth / 2)
    }
    for (j = 1; j < Nsize; j++) {
      p.line(screenWidth / 2 - 1, outsize * j, screenWidth, outsize * j)
    }

    // draw human drawing
    if (strokes && strokes.length > 0) {
      drawExample(strokes, startX, startY, lineColor, 3.0)
    }
    if (rawStrokes && rawStrokes.length > 0) {
      drawExample(rawStrokes, startX, startY, rawLineColor, lineWidth)
    }

    // draw on the model screens
    var o_x, o_y

    var scale = Nsize

    var scaled_strokes = sketchModel.scale_drawing_by_factor(rawStrokes, 1.0 / scale)

    // individual models:
    for (i = 0; i < Nsize; i++) {
      for (j = 0; j < Nsize; j++) {
        o_x = originX[i][j]
        o_y = originY[i][j]

        drawExample(scaled_strokes, o_x + startX / scale, o_y + startY / scale, rawLineColor, lineWidth)
      }
    }
  }

  const restartModels = function () {
    var i, j

    // individual models:
    for (i = 0; i < Nsize; i++) {
      for (j = 0; j < Nsize; j++) {
        modelState[i][j] = sketchModel.zero_state()
        modelX[i][j] = 0
        modelY[i][j] = 0
        modelDX[i][j] = 0
        modelDY[i][j] = 0
        modelIsActive[i][j] = false
        modelSteps[i][j] = 0
        modelPrevPen[i][j] = [0, 1, 0]
      }
    }
  }

  const encodeModels = function (sequence) {
    // encode from beginning of human-generated sequence to present.
    var i, j

    if (sequence.length <= minSequenceLength) {
      return
    }
    // encode sequence
    var rnn_state = sketchModel.zero_state()
    rnn_state = sketchModel.update(sketchModel.zero_input(), rnn_state)
    for (i = 0; i < sequence.length - 1; i++) {
      rnn_state = sketchModel.update(sequence[i], rnn_state)
    }

    // individual models:
    var sx = lastPoint[0]
    var sy = lastPoint[1]

    var dx, dy, pen_down, pen_up, pen_end
    var s = sequence[sequence.length - 1]

    for (i = 0; i < Nsize; i++) {
      for (j = 0; j < Nsize; j++) {
        modelState[i][j] = sketchModel.copy_state(rnn_state) // bounded

        modelX[i][j] = sx
        modelY[i][j] = sy

        dx = s[0]
        dy = s[1]
        pen_down = s[2]
        pen_up = s[3]
        pen_end = s[4]

        modelDX[i][j] = dx
        modelDY[i][j] = dy
        modelIsActive[i][j] = true
        modelSteps[i][j] = 0
        modelPrevPen[i][j] = [pen_down, pen_up, pen_end]
      }
    }
  }

  const processModels = function () {
    var i, j

    var pdf // store all the parameters of a mixture-density distribution
    var m_dx, m_dy, m_x, m_y
    var m_pen_down, m_pen_up, m_pen_end
    var x0, y0, x1, y1

    var o_x, o_y

    var scale = Nsize

    // individual models:
    for (i = 0; i < Nsize; i++) {
      for (j = 0; j < Nsize; j++) {
        if (modelSteps[i][j] > sketchModel.max_seq_len) {
          modelIsActive[i][j] = false
        }

        if (modelIsActive[i][j]) {
          o_x = originX[i][j]
          o_y = originY[i][j]
          m_x = modelX[i][j]
          m_y = modelY[i][j]
          m_dx = modelDX[i][j]
          m_dy = modelDY[i][j]
          m_pen_down = modelPrevPen[i][j][0]
          m_pen_up = modelPrevPen[i][j][1]
          m_pen_end = modelPrevPen[i][j][2]
          modelState[i][j] = sketchModel.update([m_dx, m_dy, m_pen_down, m_pen_up, m_pen_end], modelState[i][j])
          modelSteps[i][j] += 1
          pdf = sketchModel.get_pdf(modelState[i][j]);
          [m_dx, m_dy, m_pen_down, m_pen_up, m_pen_end] = sketchModel.sample(pdf, temperature, 0.5 + 0.5 * temperature)
          if (m_pen_end === 1) {
            modelIsActive[i][j] = false
            if (asyncDraw) {
              continue
            } else {
              return
            }
          }

          if (modelPrevPen[i][j][0] === 1) {
            // draw line connecting prev point to current point.
            x0 = m_x / scale
            y0 = m_y / scale
            x1 = (m_x + m_dx) / scale
            y1 = (m_y + m_dy) / scale
            if (insideBox(x0, y0, outsize) && insideBox(x1, y1, outsize)) {
              p.stroke(predictLineColor)
              p.strokeWeight(lineWidth)
              p.line(o_x + x0, o_y + y0, o_x + x1, o_y + y1)
            }
          }

          modelDX[i][j] = m_dx
          modelDY[i][j] = m_dy
          modelPrevPen[i][j] = [m_pen_down, m_pen_up, m_pen_end]
          modelX[i][j] += m_dx
          modelY[i][j] += m_dy

          if (!asyncDraw) {
            return // draw one at a time
          }
        }
      }
    }
  }

  const drawUserStrokes = function (x, y, dx, dy) {
    // draw on large main screen
    p.stroke(rawLineColor)
    p.strokeWeight(lineWidth) // nice thick line
    p.line(x, y, x + dx, y + dy) // draw line connecting prev point to current point.

    // draw on the model screens
    var i, j
    var o_x, o_y, x0, y0, x1, y1

    var scale = Nsize

    // individual models:
    for (i = 0; i < Nsize; i++) {
      for (j = 0; j < Nsize; j++) {
        o_x = originX[i][j]
        o_y = originY[i][j]

        x0 = x / scale
        y0 = y / scale
        x1 = (x + dx) / scale
        y1 = (y + dy) / scale

        p.stroke(rawLineColor)
        p.strokeWeight(lineWidth)
        p.line(o_x + x0, o_y + y0, o_x + x1, o_y + y1)
      }
    }
  }

  const restart = function () {
    restartModels()

    // input setup
    // start drawing from somewhere in middle of the canvas
    var r = p.random(64, 224)
    var g = p.random(64, 224)
    var b = p.random(64, 224)
    lineColor = p.color(r, g, b, 64)
    rawLineColor = p.color(r, g, b, 255) // p.color(p.random(64, 224), p.random(64, 224), p.random(64, 224));
    r = p.random(64, 224)
    g = p.random(64, 224)
    b = p.random(64, 224)
    predictLineColor = p.color(r, g, b, 255)

    x = insize / 2.0
    y = insize / 2.0
    hasStarted = false

    strokes = []
    rawStrokes = []
    rawLines = []
    currentRawLine = []

    redrawScreen()
  }

  const processUserInput = function () {
    const pointerPressed = p.touchIsDown || p.mouseIsPressed
    const pointerX = p.touchX || p.mouseX
    const pointerY = p.touchY || p.mouseY

    // record pen drawing from user:
    if (pointerPressed && (pointerX <= insize) && (pointerY <= insize - 27)) { // pen is touching the paper
      if (hasStarted === false) { // first time anything is written
        hasStarted = true
        x = p.mouseX
        y = p.mouseY
        startX = x
        startY = y
        pen = 0
        currentRawLine.push([x, y])
      } else {
        if (pen === 1) {
          redrawScreen()
        }
        var dx0 = p.mouseX - x // candidate for dx
        var dy0 = p.mouseY - y // candidate for dy
        if (dx0 * dx0 + dy0 * dy0 > epsilon * epsilon) { // only if pen is not in same area
          dx = dx0
          dy = dy0
          pen = 0
          if (prevPen === 0) {
            drawUserStrokes(x, y, dx, dy)
          }

          // update the absolute coordinates from the offsets
          x += dx
          y += dy

          // update raw_lines
          currentRawLine.push([x, y])
          justFinishedLine = true
        }
      }
    } else { // pen is above the paper
      pen = 1
      if (justFinishedLine) {
        currentRawLineSimple = DataTool.simplify_line(currentRawLine)

        if (currentRawLineSimple.length > 1) {
          if (rawLines.length === 0) {
            lastPoint = [startX, startY]
          } else {
            idx = rawLines.length - 1
            lastPoint = rawLines[idx][rawLines[idx].length - 1]
          }

          rawStroke = DataTool.line_to_stroke(currentRawLine, lastPoint)
          rawStrokes = rawStrokes.concat(rawStroke)
          stroke = DataTool.line_to_stroke(currentRawLineSimple, lastPoint)
          rawLines.push(currentRawLineSimple)
          strokes = strokes.concat(stroke)
          redrawScreen()

          // rock it!
          idx = rawLines.length - 1
          lastPoint = rawLines[idx][rawLines[idx].length - 1]

          encodeModels(strokes)
        } else {
          if (rawLines.length === 0) {
            hasStarted = false
          }
        }

        currentRawLine = []
        justFinishedLine = false
      }
    }
    prevPen = pen
  }

  const randomButtonEvent = function () {
    var item = classList[Math.floor(Math.random() * classList.length)]
    modelSelection.value(item)
    modelSelected()
  }

  const resetButtonEvent = function () {
    restart()
  }

  const setTitleText = function (new_text) {
    titleText = new_text.split('_').join(' ')
    textTitle.html(titleText)
  }

  const predictEvent = function () {
    redrawScreen()
    restartModels()
    encodeModels(strokes)
  }

  const modelSelected = function () {
    var c = modelSelection.value()
    // var v = vae_sel.value();
    var v = 'gen'
    var call_back = function (new_model) {
      sketchModel = new_model
      // console.log(model.info, '>>> ')
      sketchModel.set_pixel_factor(screen_scale_factor)
      redrawScreen()
      restartModels()
      encodeModels(strokes)
      setTitleText(`Draw a ${sketchModel.info.name}...`)

      asyncDraw = true
      if (sketchModel.zero_state()[0].size > 512) {
        asyncDraw = false
      }
    }
    setTitleText(`loading ${c}...<br/><br/><br/>input disabled.`)
    ModelImporter.change_model(sketchModel, c, v, call_back)
  }

  function setup () {
    init()
    restart()
  }

  function draw () {
    processUserInput()
    if (pen === 1) {
      processModels()
    }
  }

  p.setup = setup
  p.draw = draw
  window.addEventListener('resize', setup)
}
