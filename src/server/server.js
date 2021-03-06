/*jslint bitwise: true, node: true */
'use strict';

var express            = require('express'),
    app                = express(),
    http               = require('http').Server(app),
    io                 = require('socket.io')(http),
    SAT                = require('sat'),
    configuration      = require('../../config.json'),  // Import game settings
    util               = require('./lib/util'),  // Import utilities
    quadtree           = require('../../quadtree'),  // Import quadtree
    args               = {x: 0, y: 0, h: configuration.gameHeight, w: configuration.gameWidth, maxChildren: 1, maxDepth: 5},
    tree               = quadtree.QUAD.init(args),
    users              = [],
    food               = [],
    sockets            = {},
    leaderboard        = [],
    leaderboardChanged = false,
    V                  = SAT.Vector,
    C                  = SAT.Circle,
    initMassLog        = util.log(configuration.defaultPlayerMass, configuration.slowBase);

console.log(args);

app.use(express.static(__dirname + '/../client'));

function addFood(toAdd) {
  var radius = util.massToRadius(configuration.foodMass);
  while (toAdd--) {
    var position = configuration.foodUniformDisposition ? util.uniformPosition(food, radius) : util.randomPosition(radius);

    food.push({
      // make ids unique
      id:           ((new Date()).getTime() + '' + food.length) >>> 0,
      x:            position.x,
      y:            position.y,
      radius:       radius,
      randomOffset: Math.random(),
      mass:         Math.random() + 2,
      color:        util.randomColor()
    });
  }
}

function removeFood(toRem) {
  while (toRem--) {
    food.pop();
  }
}

// implement player movement in the direction of the target
function movePlayer(player) {
  var playerCircles = [],
      node,
      i;

  for (i = 0; i < player.nodes.length; i++) {
    node = player.nodes[i];

    playerCircles.push(
      new C(
        new V(node.x, node.y),
        node.radius
      )
    );
  }
  for (i = 0; i < player.nodes.length; i++) {
    moveNode(player, player.nodes[i], playerCircles, i);
  }
  util.updatePlayerXandY(player);
}

function moveNode(player, node, playerCircles, index) {
  var dx       = player.target.x - (node.x - player.x),
      dy       = player.target.y - (node.y - player.y),
      dist     = Math.sqrt(Math.pow(dy, 2) + Math.pow(dx, 2)),
      deg      = Math.atan2(dy, dx),
      // slowDown = util.log(node.mass, configuration.slowBase) - initMassLog + 1,
      slowDown = Math.log(node.mass),
      speedY   = player.speed,
      speedX   = player.speed,
      deltaY,
      deltaX,
      newX     = node.x,
      newY     = node.y,
      collided = false,
      newCircle,
      i,
      response,
      existingResponse,
      playerNode,
      smallNode,
      largeNode,
      smallNodePastRelease,
      largeNodePastRelease,
      largeCircle,
      eatOverlap,
      existingOverlap;

  if (player.speedBoostTill !== undefined && new Date().getTime() <= player.speedBoostTill) {
    speedY = speedY * configuration.speedBoostMultiplier;
    speedX = speedX * configuration.speedBoostMultiplier;
  }

  if (node.splitBoostTill !== undefined && new Date().getTime() <= node.splitBoostTill) {
    speedY = speedY * configuration.splitBoostMultiplier;
    speedX = speedX * configuration.splitBoostMultiplier;
  }

  deltaY   = speedY * Math.sin(deg) / slowDown;
  deltaX   = speedX * Math.cos(deg) / slowDown;

  if (dist < (50 + node.radius)) {
    deltaY *= dist / (50 + node.radius);
    deltaX *= dist / (50 + node.radius);
  }

  if (!isNaN(deltaY)) {
    newY += deltaY;
  }
  if (!isNaN(deltaX)) {
    newX += deltaX;
  }
  newCircle = new C(
    new V(newX, newY),
    node.radius
  );

  for (i = 0; i < playerCircles.length; i++) {
    response = new SAT.Response();

    if (i !== index) {
      collided = SAT.testCircleCircle(playerCircles[i], newCircle, response);

      if (collided === true) {
        playerNode = player.nodes[i];

        if (playerNode === undefined) {
          return;
        }

        if (node.mass > playerNode.mass) {
          smallNode   = playerNode;
          largeNode   = node;
          largeCircle = newCircle;
        } else {
          smallNode   = node;
          largeNode   = playerNode;
          largeCircle = playerCircles[i];
        }
        smallNodePastRelease = smallNode.releaseTime < new Date().getTime();
        largeNodePastRelease = largeNode.releaseTime < new Date().getTime();
        eatOverlap           = SAT.pointInCircle(new V(smallNode.x, smallNode.y), largeCircle);

        // allow small overlap
        if (response.overlap < 3) {
          continue;
        }

        if ((largeNode.releaseTime === undefined && (smallNode.releaseTime === undefined || smallNodePastRelease)) ||
            (smallNode.releaseTime === undefined && largeNodePastRelease) ||
            (smallNodePastRelease && largeNodePastRelease)) {
          if (eatOverlap === true) {
            mergeNodes(player, i, index);
            return;
          } else {
            continue;
          }
        }

        // move the node if it creates less overlap
        existingResponse = new SAT.Response();
        existingOverlap  = SAT.testCircleCircle(playerCircles[i], playerCircles[index], existingResponse);
        if (existingOverlap && response.overlap < existingResponse.overlap) {
          continue;
        }

        // don't want to move because there was a collision
        return;
      }
    }
  }

  node.y               = newY;
  node.x               = newX;
  playerCircles[index] = newCircle;

  var borderCalc = node.radius / 3;

  if (node.x > configuration.gameWidth - borderCalc) {
    node.x = configuration.gameWidth - borderCalc;
  }
  if (node.y > configuration.gameHeight - borderCalc) {
    node.y = configuration.gameHeight - borderCalc;
  }
  if (node.x < borderCalc) {
    node.x = borderCalc;
  }
  if (node.y < borderCalc) {
    node.y = borderCalc;
  }
}

function mergeNodes(player, aIndex, bIndex) {
  var returnNodes = [],
      mergeMass,
      node,
      i;

  for (i = 0; i < player.nodes.length; i++) {
    node = player.nodes[i];

    if (i !== aIndex && i !== bIndex) {
      returnNodes.push({
        x:           node.x,
        y:           node.y,
        mass:        node.mass,
        releaseTime: node.releaseTime,
        radius:      node.radius
      });
    }
  }

  mergeMass = player.nodes[aIndex].mass + player.nodes[bIndex].mass;
  returnNodes.push({
    x:      Math.round((player.nodes[aIndex].x + player.nodes[aIndex].x) / 2),
    y:      Math.round((player.nodes[aIndex].y + player.nodes[aIndex].y) / 2),
    mass:   mergeMass,
    radius: util.massToRadius(mergeMass)
  });

  player.nodes = returnNodes;
  util.updatePlayer(player);
}

function balanceMass() {
  var totalMass = food.length * configuration.foodMass +
      users.map(function(u) {
        var mass = 0;
        for (var i = 0; i < u.nodes.length; i++) {
          mass += u.nodes[i].mass;
        }
        return mass;
      }).reduce(function(pu, cu) {
        return pu + cu;
      }, 0),
      massDiff     = configuration.gameMass - totalMass,
      maxFoodDiff  = configuration.maxFood - food.length,
      foodDiff     = parseInt(massDiff / configuration.foodMass) - maxFoodDiff,
      foodToAdd    = Math.min(foodDiff, maxFoodDiff),
      foodToRemove = -Math.max(foodDiff, maxFoodDiff);

  if (foodToAdd > 0) {
    //console.log('adding ' + foodToAdd + ' food to level');
    addFood(foodToAdd);
    //console.log('mass rebalanced');
  }
  else if (foodToRemove > 0) {
    //console.log('removing ' + foodToRemove + ' food from level');
    removeFood(foodToRemove);
    //console.log('mass rebalanced');
  }
}

io.on('connection', function (socket) {
  console.log('A user connected!');

  var radius = util.massToRadius(configuration.defaultPlayerMass),
      position = configuration.newPlayerInitialPosition == 'farthest' ? util.uniformPosition(users, radius) : util.randomPosition(radius),
      currentPlayer = {
        id:    socket.id,
        nodes: [{
          x:      position.x,
          y:      position.y,
          w:      radius,
          h:      radius,
          radius: radius,
          mass:   configuration.defaultPlayerMass,
        }],
        x:              position.x,
        y:              position.y,
        hue:            Math.round(Math.random() * 360),
        lastHeartbeat:  new Date().getTime(),
        lastSpeedBoost: new Date().getTime(),
        target: {
          x: 0,
          y: 0
        }
      };

  socket.on('gotit', function (player) {
    console.log('Player ' + player.id + ' connecting');
    util.updatePlayerViableXandY(player);

    if (util.findIndex(users, player.id) > -1) {
      console.log('That playerID is already connected, kicking');
      socket.disconnect();
    } else if (!util.validNick(player.name)) {
      socket.emit('kick', 'Invalid username');
      socket.disconnect();
    } else {
      console.log('Player ' + player.id + ' connected!');
      sockets[player.id] = socket;

      var radius = util.massToRadius(configuration.defaultPlayerMass);
      var position = configuration.newPlayerInitialPosition == 'farthest' ? util.uniformPosition(users, radius) : util.randomPosition(radius);

      player.nodes = [{
        x:      position.x,
        y:      position.y,
        w:      radius,
        h:      radius,
        radius: radius,
        mass:   configuration.defaultPlayerMass,
      }];
      player.target.x = player.x;
      player.target.y = player.y;
      currentPlayer = player;
      currentPlayer.lastHeartbeat  = new Date().getTime();
      currentPlayer.lastSpeedBoost = new Date().getTime();
      util.updatePlayer(player);
      console.log("player");
      console.log(player);
      users.push(currentPlayer);

      io.emit('playerJoin', { name: currentPlayer.name });

      socket.emit('gameSetup', {
        gameWidth:     configuration.gameWidth,
        gameHeight:    configuration.gameHeight,
        currentPlayer: player
      });
      console.log('Total player: ' + users.length);
    }
  });

  socket.on('ping', function () {
    socket.emit('pong');
  });

  socket.on('windowResized', function (data) {
    currentPlayer.screenWidth  = data.screenWidth;
    currentPlayer.screenHeight = data.screenHeight;
    util.updatePlayerViableXandY(currentPlayer);
  });

  socket.on('respawn', function () {
    if (util.findIndex(users, currentPlayer.id) > -1) {
      users.splice(util.findIndex(users, currentPlayer.id), 1);
    }
    socket.emit('welcome', currentPlayer, false);
    console.log('User #' + currentPlayer.id + ' respawned');
  });

  socket.on('disconnect', function () {
    if (util.findIndex(users, currentPlayer.id) > -1)
    users.splice(util.findIndex(users, currentPlayer.id), 1);
    console.log('User #' + currentPlayer.id + ' disconnected');

    socket.broadcast.emit('playerDisconnect', { name: currentPlayer.name });
  });

  socket.on('playerChat', function(data) {
    var _sender = data.sender.replace(/(<([^>]+)>)/ig, ''),
        _message = data.message.replace(/(<([^>]+)>)/ig, '');

    if (configuration.logChat === 1) {
      console.log('[CHAT] [' + (new Date()).getHours() + ':' + (new Date()).getMinutes() + '] ' + _sender + ': ' + _message);
    }
    socket.broadcast.emit('serverSendPlayerChat', {sender: _sender, message: _message});
  });

  socket.on('pass', function(data) {
    if (data[0] === configuration.adminPass) {
      console.log(currentPlayer.name + ' just logged in as an admin');
      socket.emit('serverMSG', 'Welcome back ' + currentPlayer.name);
      socket.broadcast.emit('serverMSG', currentPlayer.name + ' just logged in as admin!');
      currentPlayer.admin = true;
    } else {
      console.log(currentPlayer.name + ' sent incorrect admin password');
      socket.emit('serverMSG', 'Password incorrect attempt logged.');
      // TODO actually log incorrect passwords
    }
  });

  socket.on('kick', function(data) {
    if (currentPlayer.admin) {
      var reason = '',
          worked = false;

      for (var e = 0; e < users.length; e++) {
        if (users[e].name === data[0] && !users[e].admin && !worked) {
          if (data.length > 1) {
            for (var f = 1; f < data.length; f++) {
              if (f === data.length) {
                reason = reason + data[f];
              }
              else {
                reason = reason + data[f] + ' ';
              }
            }
          }
          if (reason !== '') {
            console.log('User ' + users[e].name + ' kicked successfully by ' + currentPlayer.name + ' for reason ' + reason);
          }
          else {
            console.log('User ' + users[e].name + ' kicked successfully by ' + currentPlayer.name);
          }
          socket.emit('serverMSG', 'User ' + users[e].name + ' was kicked by ' + currentPlayer.name);
          sockets[users[e].id].emit('kick', reason);
          sockets[users[e].id].disconnect();
          users.splice(e, 1);
          worked = true;
        }
      }
      if (!worked) {
        socket.emit('serverMSG', 'Could not find user or user is admin');
      }
    } else {
      console.log(currentPlayer.name + ' is trying to use -kick but isn\'t admin');
      socket.emit('serverMSG', 'You are not permitted to use this command');
    }
  });

  // Heartbeat function, update everytime
  socket.on('0', function(target) {
    currentPlayer.lastHeartbeat = new Date().getTime();
    if (target.x !== currentPlayer.x || target.y !== currentPlayer.y) {
      currentPlayer.target = target;
    }
  });

  socket.on('speedBoost', function() {
    var now            = new Date().getTime(),
        timeTillRefesh = configuration.speedBoostRefreshTime - (now - currentPlayer.lastSpeedBoost);

    if (configuration.speedBoostEnabled === true && timeTillRefesh <= 0) {
      currentPlayer.speedBoostTill = now + configuration.speedBoostDurationTime;
      currentPlayer.lastSpeedBoost = now;
    }
  });

  socket.on('playerSplit', function () {
    var nodes       = currentPlayer.nodes,
        returnNodes = [],
        node,
        deg,
        deltaY,
        deltaX,
        splitMass,
        radius,
        releaseTime    = new Date().getTime() + configuration.releaseTime,
        splitBoostTill = new Date().getTime() + configuration.splitBoostDurationTime,
        i;


    if (nodes.length < configuration.maxNodes) {
      for (i = 0; i < nodes.length; i++) {
        node   = nodes[i];
        deg    = Math.atan2(currentPlayer.target.x - (node.x - currentPlayer.x), currentPlayer.target.y - (node.y - currentPlayer.y));
        deltaY = Math.sin(deg);
        deltaX = Math.cos(deg);

        if (node.mass >= configuration.minSplitMass && returnNodes.length < configuration.maxNodes - 1) {
          splitMass = Math.round(node.mass / 2);

          returnNodes.push({
            x:              node.x,
            y:              node.y,
            mass:           splitMass,
            radius:         util.massToRadius(splitMass),
            releaseTime:    releaseTime,
            splitBoostTill: node.splitBoostTill
          });

          splitMass = node.mass - splitMass;
          radius    = util.massToRadius(splitMass);

          returnNodes.push({
            x:              Math.round(node.x + deltaX),
            y:              Math.round(node.y + deltaY),
            mass:           splitMass,
            radius:         radius,
            releaseTime:    releaseTime,
            splitBoostTill: splitBoostTill
          });
        } else {
          returnNodes.push({
            x:              node.x,
            y:              node.y,
            mass:           node.mass,
            radius:         node.radius,
            releaseTime:    node.releaseTime,
            splitBoostTill: node.splitBoostTill
          });
        }
      }
      if (nodes.length >= returnNodes.length) {
        return;
      }
      currentPlayer.nodes = returnNodes;
    }

    util.updatePlayer(currentPlayer);
  });
});

function tickPlayer(currentPlayer) {
  if (currentPlayer.lastHeartbeat < new Date().getTime() - configuration.maxHeartbeatInterval) {
    sockets[currentPlayer.id].emit('kick', 'You where inactive for ' + configuration.maxHeartbeatInterval / 1000 + ' seconds.');
    sockets[currentPlayer.id].disconnect();
  }
  movePlayer(currentPlayer);
  var nodeCircles = [],
      foodEaten,
      i,
      j;

  for (i = 0; i < currentPlayer.nodes.length; i++) {
    var node = currentPlayer.nodes[i],
        nodeCircle = new C(
          new V(node.x, node.y),
          node.radius
        );

    nodeCircles.push([i, nodeCircle]);
  }

  foodEaten = food.map(function(f) {
    var select = false;

    for (i = 0; i < nodeCircles.length; i++) {
      select = SAT.pointInCircle(new V(f.x, f.y), nodeCircles[i][1]);
      if (select === true) {
        var node = currentPlayer.nodes[nodeCircles[i][0]];

        util.addMassToNodeAndUpdatePlayer(currentPlayer, node, configuration.foodMass);
        return true;
      }
    }
    return false;
  }).reduce(function(a, b, configuration) {
    return b ? a.concat(configuration) : a;
  }, []);

  foodEaten.forEach( function(f) {
    food[f] = {};
    food.splice(f, 1);
  });

  currentPlayer.speed   = configuration.playerSpeed;
  currentPlayer.mass   += foodEaten.length * configuration.foodMass;

  for (i = 0; i < nodeCircles.length; i++) {
    nodeCircles[i].r = currentPlayer.nodes[i].radius;
  }

  tree.clear();
  tree.insert(users);
  var playerCollisions = [];
  var otherUsers = tree.retrieve(currentPlayer, function(user) {
        if (user.id !== currentPlayer.id) {
          var response = new SAT.Response(),
              collided = false;

          for (i = 0; i < nodeCircles.length; i++) {
            for (j = 0; j < user.nodes.length; j++) {
              collided = SAT.testCircleCircle(
                nodeCircles[i][1],
                new C(
                  new V(user.nodes[j].x, user.nodes[j].y),
                  user.nodes[j].radius
                ),
                response
              );
              if (collided === true) {
                response.aUser      = currentPlayer;
                response.aNode      = currentPlayer.nodes[nodeCircles[i][0]];
                response.aNodeIndex = nodeCircles[i][0];
                response.bUser      = user;
                response.bNode      = user.nodes[j];
                response.bNodeIndex = j;
                playerCollisions.push(response);
              }
            }
          }
        }
      });

  playerCollisions.forEach(function(collision) {
    var a_large = (collision.aNode.mass > collision.bNode.mass),
        smallUser      = a_large ? collision.bUser      : collision.aUser,
        smallNode      = a_large ? collision.bNode      : collision.aNode,
        smallNodeIndex = a_large ? collision.bNodeIndex : collision.aNodeIndex,
        largeUser      = a_large ? collision.aUser      : collision.bUser,
        largeNode      = a_large ? collision.aNode      : collision.bNode,
        largeNodeIndex = a_large ? collision.aNodeIndex : collision.bNodeIndex,
        overlap        = SAT.pointInCircle(new V(smallNode.x, smallNode.y),
                          new C(
                            new V(largeNode.x, largeNode.y),
                            largeNode.radius
                          )
                        );

    // console.log("collision");
    // console.log(collision);

    if (largeNode.mass > smallNode.mass * 1.1 && overlap) {
    // if (overlap &&
    //      (
    //        (
    //          largeNode.releaseTime !== undefined && new Date().getTime() < largeNode.releaseTime && largeNode.mass > smallNode.mass * 1.3
    //        ) || (
    //          (
    //            largeNode.releaseTime === undefined || (
    //              largeNode.releaseTime !== undefined && largeNode.releaseTime < new Date().getTime()
    //            )
    //          ) && largeNode.mass > smallNode.mass * 1.1
    //        )
    //      )
    //    ) {
        // largeNode.radius > Math.sqrt(Math.pow(largeNode.x - smallNode.x, 2) + Math.pow(largeNode.y - smallNode.y, 2))*1.75) {

      // remove the smaller node
      smallUser.nodes.splice(smallNodeIndex, 1);

      // player dies if they don't have any nodes
      if (smallUser.nodes.length === 0 ) {
        console.log('KILLING USER: ' + smallUser.id);

        if (util.findIndex(users, smallUser.id) > -1)
        users.splice(util.findIndex(users, smallUser.id), 1);

        io.emit('playerDied', {
          killerName: largeUser.name,
          killedName: smallUser.name
        });

        util.addMassToNodeAndUpdatePlayer(largeUser, largeNode, smallNode.mass);
        sockets[smallUser.id].emit('RIP');
      }
    }
  });
}

function moveloop() {
  for (var i = 0; i < users.length; i++) {
    tickPlayer(users[i]);
  }
}

function gameloop() {
  if (users.length > 0) {
    users.sort( function(a, b) { return b.mass - a.mass; });

    var topUsers = [];

    for (var i = 0; i < Math.min(10, users.length); i++) {
      topUsers.push({
        id:   users[i].id,
        name: users[i].name
      });
    }

    if (isNaN(leaderboard) || leaderboard.length !== topUsers.length) {
      leaderboard = topUsers;
      leaderboardChanged = true;
    } else {
      for (i = 0; i < leaderboard.length; i++) {
        if (leaderboard[i].id !== topUsers[i].id) {
          leaderboard = topUsers;
          leaderboardChanged = true;
          break;
        }
      }
    }

    for (i = 0; i < users.length; i++) {
      if (users[i].mass * (1 - (configuration.massLossRate / 1000)) > configuration.defaultPlayerMass)
      users[i].mass *= (1 - (configuration.massLossRate / 1000));
    }
  }
  balanceMass();
}

function sendUpdates() {
  users.forEach( function(u) {
    var visibleFood = food.map(function(f) {
                        if (f.x > u.x - ((u.screenWidth / 2) / u.distToPixs) - 20 &&
                          f.x < u.x + ((u.screenWidth / 2) / u.distToPixs) + 20 &&
                          f.y > u.y - ((u.screenHeight / 2) / u.distToPixs) - 20 &&
                          f.y < u.y + ((u.screenHeight / 2) / u.distToPixs) + 20) {
                          return f;
                        }
                      }).filter(function(f) { return f; });

    var visibleEnemies = users.map(function(f) {
                           var fclone;

                           for (var i = 0; i < f.nodes.length; i++) {
                             var fnode = f.nodes[i];
                             for (var j = 0; j < u.nodes.length; j++) {
                               var unode       = u.nodes[j],
                                   overXLeft   = fnode.x + fnode.radius > unode.x - ((u.screenWidth / 2) / u.distToPixs) - 20,
                                   underXRight = fnode.x - fnode.radius < unode.x + ((u.screenWidth / 2) / u.distToPixs) + 20,
                                   underYTop   = fnode.y + fnode.radius > unode.y - ((u.screenHeight / 2) / u.distToPixs) - 20,
                                   overYBottom = fnode.y - fnode.radius < unode.y + ((u.screenHeight / 2) / u.distToPixs) + 20;

                               if (f.id !== u.id && ((overXLeft || underXRight) && (underYTop || overYBottom))) {
                                 if (fclone === undefined) {
                                   fclone = {
                                     id: f.id,
                                     nodes: [{
                                       x:      fnode.x,
                                       y:      fnode.y,
                                       radius: Math.round(fnode.radius),
                                       mass:   Math.round(fnode.mass),
                                     }],
                                     hue:  f.hue,
                                     name: f.name
                                   };
                                 } else {
                                   fclone.nodes.push({
                                       x:      Math.round(fnode.x),
                                       y:      Math.round(fnode.y),
                                       radius: Math.round(fnode.radius),
                                       mass:   Math.round(fnode.mass),
                                   });
                                 }
                               }
                             }
                           }
                           return fclone;
                         }).filter(function(f) { return f; });

    util.updatePlayerXandY(u);

    var uClone = {
      id:         u.id,
      nodes:      [],
      x:          Math.round(u.x),
      y:          Math.round(u.y),
      unitPixs:   u.unitPixs,
      distToPixs: u.distToPixs,
      mass:       Math.round(u.mass),
      hue:        u.hue,
      name:       u.name
    };

    for (var i = 0; i < u.nodes.length; i++) {
      var unode = u.nodes[i];

      uClone.nodes.push({
        x:      Math.round(unode.x),
        y:      Math.round(unode.y),
        radius: Math.round(unode.radius),
        mass:   Math.round(unode.mass),
      });
    }

    sockets[u.id].emit('serverTellPlayerMove', uClone, visibleEnemies, visibleFood);
    if (leaderboardChanged) {
      sockets[u.id].emit('leaderboard', {
        players:     users.length,
        leaderboard: leaderboard
      });
    }

    if (configuration.speedBoostEnabled === true) {
      var now = new Date().getTime(),
          timeTillRefesh = Math.round((configuration.speedBoostRefreshTime - (now - u.lastSpeedBoost)) / 1000),
          msg            = "Press 's' for Speeed Boost!";

      if (timeTillRefesh > 0) {
        msg = "Speed Boost in " + timeTillRefesh;
      }
      sockets[u.id].emit('speedBoostTimer', msg);
    } else {
      sockets[u.id].emit('speedBoostTimer', "", true);
    }
  });
  leaderboardChanged = false;

}

setInterval(moveloop, 1000 / 60);
setInterval(gameloop, 1000);
setInterval(sendUpdates, 1000 / configuration.networkUpdateFactor);

// Don't touch on ip
var ipaddress  = process.env.OPENSHIFT_NODEJS_IP   || process.env.IP   || '127.0.0.1';
var serverport = process.env.OPENSHIFT_NODEJS_PORT || process.env.PORT || configuration.port;
if (process.env.OPENSHIFT_NODEJS_IP !== undefined) {
  http.listen( serverport, ipaddress, function() {
    console.log('listening on *:' + serverport);
  });
} else {
  http.listen( serverport, function() {
    console.log('listening on *:' + configuration.port);
  });
}
