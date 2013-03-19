GraphViz visualizer for NoFlo flows
===================================

This package provides a command-line tool for creating GraphViz visualizations of NoFlo flows.

## Installation

You need a working installation of the [GraphViz](http://www.graphviz.org/) tool. Then just install the NoFlo visualizer with:

    $ npm install -g noflo-graphviz

## Running

The NoFlo GraphViz visualizer takes a NoFlo graph file (either JSON or FBP format), and generates a SVG visualization of it. You can do this by running:

    $ noflo-graphviz my_project/graphs/SomeGraph.fbp

The generated SVG file will be named based on the graph being visualized, and will be stored in your current working directory.
