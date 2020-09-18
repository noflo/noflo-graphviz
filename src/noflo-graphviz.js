const path = require('path');
const noflo = require('noflo');
const graphviz = require('graphviz');
const { _ } = require('underscore');

let loader = null;
const nodes = {};
const components = {};
const layers = true;

function cleanID(id) {
  return id.replace(/\s*/g, '');
}
function cleanPort(port) {
  return port.toUpperCase().replace(/\./g, '');
}

const colors = {
  component: {
    fill: '#204a87',
    label: '#ffffff',
  },
  graph: {
    fill: '#5c3566',
    label: '#ffffff',
  },
  gate: {
    fill: '#a40000',
    label: '#ffffff',
  },
  initial: {
    edge: '#2e3436',
    fill: '#eeeeec',
    label: '#555753',
  },
  port: {
    label: '#555753',
    edge: '#555753',
  },
  export: {
    fill: '#e9b96e',
    label: '#000000',
  },
  routes: {
    taken: {},
    available: [
      '#a40000',
      '#5c3566',
      '#204a87',
      '#4e9a06',
      '#8f5902',
      '#ce5c00',
      '#c4a000',
    ],
  },
};

function error(err) {
  console.error(err.message);
  console.error(err.stack.split('\n').slice(0, 4).join('\n'));
}

function getShape(component) {
  switch (component) {
    case 'Kick': case 'SendString': case 'CollectUntilIdle': return 'hexagon';
    case 'Drop': return 'none';
    default: return 'box';
  }
}

function prepareConnection(style, fromPort, toPort) {
  const params = {
    labelfontcolor: colors.port.label,
    labelfontsize: 8.0,
    color: colors[style].edge,
  };
  if (toPort) { params.headlabel = toPort; }
  if (fromPort) { params.taillabel = fromPort; }
  return params;
}

function renderNodes(graph, g, done) {
  let todo = graph.nodes.length;
  if (todo === 0) { done(); }
  return graph.nodes.forEach((node) => {
    loader.load(node.component, (err, instance) => {
      if (err) {
        error(err);
        return;
      }
      components[node.id.toLowerCase()] = instance;
      const params = {
        label: `${(node.metadata != null ? node.metadata.label : undefined) || node.id}\n${node.component}`,
        shape: getShape(node.component, instance),
        style: 'filled,rounded',
        fillcolor: colors.component.fill,
        fontcolor: colors.component.label,
      };
      if (instance.isSubgraph()) {
        params.fillcolor = colors.graph.fill;
        params.fontcolor = colors.graph.label;
      }
      if (params.shape === 'hexagon') {
        params.fillcolor = colors.gate.fill;
        params.fontcolor = colors.gate.label;
      }
      if (node.metadata.routes) {
        if (layers) {
          params.layer = node.metadata.routes.join(',');
        }
        node.metadata.routes.forEach((route) => {
          if (!colors.routes.taken[route]) {
            colors.routes.taken[route] = colors.routes.available.shift();
          }
          params.color = colors.routes.taken[route];
        });
      }

      nodes[node.id] = g.addNode(cleanID(node.id), params);
      todo -= 1;
      if (todo === 0) {
        done();
      }
    });
  });
}

function renderInitials(graph, g) {
  const result = [];
  for (let id = 0; id < graph.initializers.length; id += 1) {
    const initializer = graph.initializers[id];
    const identifier = `data${id}`;
    nodes[identifier] = g.addNode(identifier, {
      label: `'${initializer.from.data}'`,
      shape: 'plaintext',
      style: 'filled,rounded',
      fontcolor: colors.initial.label,
      fillcolor: colors.initial.fill,
    });
    result.push(g.addEdge(nodes[identifier], nodes[initializer.to.node],
      prepareConnection('initial', null, cleanPort(initializer.to.port))));
  }
  return result;
}

function renderExport(nodeId, publicPort, privatePort, direction, graph, g) {
  const identifier = `export${publicPort}`;
  nodes[identifier] = g.addNode(identifier, {
    label: publicPort.toUpperCase(),
    shape: direction === 'to' ? 'circle' : 'doublecircle',
    fontcolor: colors.export.label,
    fontsize: 10.0,
    fillcolor: colors.export.fill,
    style: 'filled',
  });

  const result = [];
  graph.nodes.forEach((node) => {
    if (node.id.toLowerCase() !== nodeId) { return; }
    if (direction === 'to') {
      g.addEdge(nodes[identifier], nodes[cleanID(node.id)],
        prepareConnection('port', null, cleanPort(privatePort)));
      return;
    }
    result.push(g.addEdge(nodes[cleanID(node.id)], nodes[identifier],
      prepareConnection('port', cleanPort(privatePort), null)));
  });
  return result;
}

function renderExports(graph, g) {
  const result = [];
  Object.keys(graph.inports).forEach((publicPort) => {
    const exported = graph.inports[publicPort];
    const nodeId = exported.process.toLowerCase();
    result.push(renderExport(nodeId, publicPort, exported.port, 'to', graph, g));
  });

  Object.keys(graph.outports).forEach((publicPort) => {
    const exported = graph.outports[publicPort];
    const nodeId = exported.process.toLowerCase();
    result.push(renderExport(nodeId, publicPort, exported.port, 'from', graph, g));
  });
  return result;
}

function renderEdges(graph, g) {
  const shown = {};
  const result = [];
  graph.edges.forEach((edge) => {
    if (!nodes[edge.from.node] || !nodes[edge.to.node]) { return; }
    const cleanFrom = cleanPort(edge.from.port);
    const cleanTo = cleanPort(edge.to.port);
    const params = prepareConnection('port', cleanFrom, cleanTo);
    const fromNode = graph.getNode(edge.from.node);
    const toNode = graph.getNode(edge.to.node);
    if (fromNode.metadata.routes && toNode.metadata.routes) {
      const common = _.intersection(fromNode.metadata.routes, toNode.metadata.routes);
      if (layers && common) {
        params.layer = common.join(',');
      }
      common.forEach((route) => {
        if (!colors.routes.taken[route]) {
          colors.routes.taken[route] = colors.routes.available.pop();
        }
        params.color = colors.routes.taken[route];
        params.style = 'bold';
      });
    }

    const fromInstance = components[edge.from.node.toLowerCase()];
    if (fromInstance.outPorts[edge.from.port].isAddressable()) {
      const identifier = `${edge.from.node}_${edge.from.port}`;
      params.sametail = edge.from.port;
      if (shown[identifier]) { delete params.taillabel; }
      shown[identifier] = true;
    }
    const toInstance = components[edge.to.node.toLowerCase()];
    if (toInstance.inPorts[edge.to.port].isAddressable()) {
      const identifier = `${edge.to.node}_${edge.to.port}`;
      params.samehead = edge.to.port;
      if (shown[identifier]) { delete params.headlabel; }
      shown[identifier] = true;
    }

    result.push(g.addEdge(nodes[edge.from.node], nodes[edge.to.node], params));
  });
  return result;
}

function render(g, output) {
  g.render(
    {
      type: output,
      use: 'dot',
    },
    `${g.id}.${output}`,
  );
  process.nextTick(() => setTimeout(() => process.exit(0),
    3000));
}

exports.toDot = (file, callback) => {
  const basedir = path.resolve(path.dirname(file), '..');
  loader = new noflo.ComponentLoader(basedir);
  noflo.graph.loadFile(file, (err, graph) => {
    if (err) {
      callback(err);
      return;
    }
    const g = graphviz.digraph(path.basename(file, path.extname(file)));
    loader.listComponents((listError) => {
      if (listError) {
        callback(listError);
        return;
      }
      renderNodes(graph, g, () => {
        renderInitials(graph, g);
        renderExports(graph, g);
        renderEdges(graph, g);
        callback(null, g);
      });
    });
  });
};

exports.main = () => {
  if (process.argv.length < 3) {
    console.log('Usage: $ graphviz-noflo file.fbp <svg|dot|png>');
    process.exit(0);
  }

  const file = path.resolve(process.cwd(), process.argv[2]);
  if ((file.indexOf('.json') === -1) && (file.indexOf('.fbp') === -1)) {
    console.error(`${file} is not a NoFlo graph file, aborting`);
    process.exit(0);
  }

  const output = process.argv.length > 3 ? process.argv[3] : 'svg';
  exports.toDot(file, (err, graph) => {
    if (err) {
      error(err);
      return;
    }
    render(graph, output);
  });
};
