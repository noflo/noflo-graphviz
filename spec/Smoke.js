const chai = require('chai');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

describe('NoFlo Graphviz smoketest', () => {
  describe('with an existing graph', () => {
    it('should run', function (done) {
      this.timeout(10000);
      exec('../bin/noflo-graphviz fixtures/graphs/Loop.fbp svg',
        { cwd: __dirname },
        done);
    });
    it('should have produced an SVG file', (done) => {
      const outputPath = path.resolve(__dirname, 'Loop.svg');
      fs.exists(outputPath, (exists) => {
        chai.expect(exists).to.equal(true);
        fs.unlink(outputPath, done);
      });
    });
  });
  describe('with a non-existing graph', () => it('should fail', function (done) {
    this.timeout(10000);
    exec('../bin/noflo-graphviz fixtures/graphs/Loop-not-found.fbp svg',
      { cwd: __dirname },
      (err, stdout, stderr) => {
        chai.expect(stderr).to.contain('ENOENT');
        done();
      });
  }));
});
