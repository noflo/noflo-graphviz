path = require 'path'
noflo = require 'noflo'
graphviz = require 'graphviz'
{_} = require 'underscore'

loader = null
nodes = {}
components = {}
layers = true

cleanID = (id) ->
  id.replace /\s*/g, ""
cleanPort = (port) ->
  port = port.toUpperCase()
  port.replace /\./g, ""

colors =
  component:
    fill: '#204a87'
    label: '#ffffff'
  graph:
    fill: '#5c3566'
    label: '#ffffff'
  gate:
    fill: '#a40000'
    label: '#ffffff'
  initial:
    edge: '#2e3436'
    fill: '#eeeeec'
    label: '#555753'
  port:
    label: '#555753'
    edge: '#555753'
  export:
    fill: '#e9b96e'
    label: '#000000'
  routes:
    taken: {}
    available: [
      '#a40000'
      '#5c3566'
      '#204a87'
      '#4e9a06'
      '#8f5902'
      '#ce5c00'
      '#c4a000'
    ]

error = (err) ->
  console.error err.message
  console.error err.stack.split("\n").slice(0, 4).join "\n"

getShape = (component, instance) ->
  switch component
    when 'Kick','SendString', 'CollectUntilIdle' then return 'hexagon'
    when 'Drop' then return 'none'
    else return 'box'

prepareConnection = (style, fromPort, toPort) ->
  params =
    labelfontcolor: colors.port.label
    labelfontsize: 8.0
    color: colors[style].edge
  params.headlabel = toPort if toPort
  params.taillabel = fromPort if fromPort
  params

renderNodes = (graph, g, done) ->
  todo = graph.nodes.length
  do done if todo is 0
  graph.nodes.forEach (node) ->
    component = loader.load node.component, (err, instance) ->
      return error err if err
      components[node.id.toLowerCase()] = instance
      params =
        label: "#{node.metadata?.label or node.id}\n#{node.component}"
        shape: getShape node.component, instance
        style: 'filled,rounded'
        fillcolor: colors.component.fill
        fontcolor: colors.component.label
      if instance.isSubgraph()
        params.fillcolor = colors.graph.fill
        params.fontcolor = colors.graph.label
      if params.shape is 'hexagon'
        params.fillcolor = colors.gate.fill
        params.fontcolor = colors.gate.label
      if node.metadata.routes
        if layers
          params.layer = node.metadata.routes.join ','
        for route in node.metadata.routes
          unless colors.routes.taken[route]
            colors.routes.taken[route] = colors.routes.available.shift()
          params.color = colors.routes.taken[route]

      nodes[node.id] = g.addNode cleanID(node.id), params
      instance = null
      todo--
      do done if todo is 0

renderInitials = (graph, g) ->
  for initializer, id in graph.initializers
    identifier = "data#{id}"
    nodes[identifier] = g.addNode identifier,
      label: "'#{initializer.from.data}'"
      shape: 'plaintext'
      style: 'filled,rounded'
      fontcolor: colors.initial.label
      fillcolor: colors.initial.fill
    g.addEdge nodes[identifier], nodes[initializer.to.node]
    , prepareConnection 'initial', null, cleanPort initializer.to.port

renderExport = (nodeId, publicPort, privatePort, direction, graph, g) ->
  identifier = "export#{publicPort}"
  nodes[identifier] = g.addNode identifier,
    label: publicPort.toUpperCase()
    shape: if direction is 'to' then 'circle' else 'doublecircle'
    fontcolor: colors.export.label
    fontsize: 10.0
    fillcolor: colors.export.fill
    style: 'filled'

  for node in graph.nodes
    continue unless node.id.toLowerCase() is nodeId
    if direction is 'to'
      g.addEdge nodes[identifier], nodes[cleanID(node.id)]
      , prepareConnection 'port', null, cleanPort(privatePort)
      continue
    g.addEdge nodes[cleanID(node.id)], nodes[identifier]
    , prepareConnection 'port', cleanPort(privatePort), null

renderExports = (graph, g) ->
  for publicPort, exported of graph.inports
    nodeId = exported.process.toLowerCase()
    port = exported.port
    renderExport nodeId, publicPort, exported.port, 'to', graph, g

  for publicPort, exported of graph.outports
    nodeId = exported.process.toLowerCase()
    port = exported.port
    renderExport nodeId, publicPort, exported.port, 'from', graph, g

  for exported in graph.exports
    # Ambiguous legacy ports
    nodeId = exported.process.toLowerCase()
    port = exported.port
    unless components[nodeId]
      message = "No component found for node #{nodeId}."
      message += " We have #{Object.keys(components).join(', ')}"
      error new Error message
    direction = 'to'
    for portName, portInstance of components[nodeId].outPorts
      continue unless portName.toLowerCase() is port
      direction = 'from'
    renderExport nodeId, exported.public, port, direction, graph, g

renderEdges = (graph, g) ->
  shown = {}
  for edge in graph.edges
    continue unless nodes[edge.from.node] and nodes[edge.to.node]
    cleanFrom = cleanPort edge.from.port
    cleanTo = cleanPort edge.to.port
    params = prepareConnection 'port', cleanFrom, cleanTo
    fromNode = graph.getNode edge.from.node
    toNode = graph.getNode edge.to.node
    if fromNode.metadata.routes and toNode.metadata.routes
      common = _.intersection fromNode.metadata.routes, toNode.metadata.routes
      if layers and common
        params.layer = common.join ','
      for route in common
        unless colors.routes.taken[route]
          colors.routes.taken[route] = colors.routes.available.pop()
        params.color = colors.routes.taken[route]
        params.style = 'bold'

    fromInstance = components[edge.from.node.toLowerCase()]
    if fromInstance.outPorts[edge.from.port] instanceof noflo.ArrayPort
      identifier = "#{edge.from.node}_#{edge.from.port}"
      params.sametail = edge.from.port
      delete params.taillabel if shown[identifier]
      shown[identifier] = true
    toInstance = components[edge.to.node.toLowerCase()]
    if toInstance.inPorts[edge.to.port] instanceof noflo.ArrayPort
      identifier = "#{edge.to.node}_#{edge.to.port}"
      params.samehead = edge.to.port
      delete params.headlabel if shown[identifier]
      shown[identifier] = true

    g.addEdge nodes[edge.from.node], nodes[edge.to.node], params

render = (g, output) ->
  g.render
    type: output
    use: 'dot'
  , "#{g.id}.#{output}"
  process.nextTick ->
    setTimeout ->
      process.exit 0
    , 3000

exports.toDot = (file, callback) ->
  basedir = path.resolve path.dirname(file), '..'
  loader = new noflo.ComponentLoader basedir
  noflo.graph.loadFile file, (err, graph) ->
    return callback err if err
    g = graphviz.digraph path.basename file, path.extname file
    loader.listComponents ->
      renderNodes graph, g, ->
        renderInitials graph, g
        renderExports graph, g
        renderEdges graph, g
        callback null, g

exports.main = ->
  if process.argv.length < 3
    console.log "Usage: $ graphviz-noflo file.fbp <svg|dot|png>"
    process.exit 0

  file = path.resolve process.cwd(), process.argv[2]
  if file.indexOf('.json') is -1 and file.indexOf('.fbp') is -1
    console.error "#{file} is not a NoFlo graph file, aborting"
    process.exit 0

  output = 'svg'
  if process.argv.length > 3
    output = process.argv[3]

  exports.toDot file, (err, graph) ->
    return error err if err
    render graph, output
