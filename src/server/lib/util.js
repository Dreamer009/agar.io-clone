/* jslint node: true */
'use strict';

var configuration = require('../../../config.json');

exports.validNick = function(nickname) {
  var regex = /^\w*$/;
  return regex.exec(nickname) !== null;
};

// determine mass from radius of circle
exports.massToRadius = function (mass) {
  return 4 + Math.sqrt(mass) * 6;
};

// overwrite Math.log function
exports.log = (function () {
  var log = Math.log;
  return function (n, base) {
    return log(n) / (base ? log(base) : 1);
  };
})();

// get the Euclidean distance between the edges of two shapes
exports.getDistance = function (p1, p2) {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)) - p1.radius - p2.radius;
};

function genPos(from, to) {
  return Math.floor(Math.random() * (to - from)) + from;
}

// generate a random position within the field of play
exports.randomPosition = function (radius) {
  return {
    x: genPos(radius, configuration.gameWidth - radius),
    y: genPos(radius, configuration.gameHeight - radius)
  };
};

exports.uniformPosition = function(points, radius) {
  var bestCandidate, maxDistance = 0;
  var numberOfCandidates = 10;

  if (points.length === 0) {
    return exports.randomPosition(radius);
  }

  // Generate the cadidates
  for (var ci = 0; ci < numberOfCandidates; ci++) {
    var minDistance = Infinity,
        candidate   = exports.randomPosition(radius);

    candidate.radius = radius;

    for (var pi = 0; pi < points.length; pi++) {
      var distance = exports.getDistance(candidate, points[pi]);
      if (distance < minDistance) {
        minDistance = distance;
      }
    }

    if (minDistance > maxDistance) {
      bestCandidate = candidate;
      maxDistance   = minDistance;
    }
  }

  return bestCandidate;
};

exports.findIndex = function(arr, id) {
  var len = arr.length;

  while (len--) {
    if (arr[len].id === id) { return len; }
  }

  return -1;
};

exports.randomColor = function() {
  var color = '#' + ('00000' + (Math.random() * (1 << 24) | 0).toString(16)).slice(-6),
      c     = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color),
      r     = (parseInt(c[1], 16) - 32) > 0 ? (parseInt(c[1], 16) - 32) : 0,
      g     = (parseInt(c[2], 16) - 32) > 0 ? (parseInt(c[2], 16) - 32) : 0,
      b     = (parseInt(c[3], 16) - 32) > 0 ? (parseInt(c[3], 16) - 32) : 0;

  return {
    fill:   color,
    border: '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
  };
};

exports.addMassToNodeAndUpdatePlayer = function(player, node, nodeMassIncrease) {
  node.mass  += nodeMassIncrease;
  node.radius = exports.massToRadius(node.mass);
  exports.updatePlayer(player);
};

exports.updatePlayer = function(player) {
  exports.updatePlayerMass(player);
  exports.updatePlayerXandY(player);
  exports.updatePlayerViableXandY(player);
};

exports.updatePlayerMass = function(player) {
  var mass = 0,
      tempMass = 0;

  for (var i = 0; i < player.nodes.length; i++) {
    tempMass = player.nodes[i].mass;
    if (typeof(tempMass) === "number") {
      mass += tempMass;
    }
  }
  player.mass = mass;
};

exports.updatePlayerXandY = function(player) {
  var tempx = 0,
      tempy = 0;

  for (var i = 0; i < player.nodes.length; i++) {
    if (typeof(player.nodes[i].x) === "number") {
      tempx += player.nodes[i].x;
    }
    if (typeof(player.nodes[i].y) === "number") {
      tempy += player.nodes[i].y;
    }
  }
  player.x = tempx / player.nodes.length;
  player.y = tempy / player.nodes.length;
};

exports.updatePlayerViableXandY = function(player) {
  var screenArea,
      screenUnit,
      unitPixs,
      xGridPixs,
      yGridPixs;

  screenUnit = (player.screenWidth * player.screenHeight) / configuration.viewableArea;
  unitPixs   = Math.sqrt(screenUnit);

  player.distToPixs = unitPixs / (exports.massToRadius(player.mass) * configuration.radiusInUnitSquare);
  player.unitPixs   = unitPixs;
};
