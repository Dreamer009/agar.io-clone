var io = require('socket.io-client'),
    playerName,
    playerNameInput = document.getElementById('playerNameInput'),
    socket,
    reason,
    KEY_ENTER       = 13,
    borderDraw      = true,
    animLoopHandle,
    spin            = -Math.PI,
    enemySpin       = -Math.PI,
    mobile          = false,
    debug           = function(args) {
      if (console && console.log) {
        console.log(args);
      }
    };

if ( /Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(navigator.userAgent) ) {
  mobile = true;
}

function startGame() {
  playerName = playerNameInput.value.replace(/(<([^>]+)>)/ig, '');
  document.getElementById('startMenuWrapper').style.maxHeight = '0px';
  document.getElementById('gameAreaWrapper').style.opacity = 1;
  if (!socket) {
    socket = io();
    setupSocket(socket);
  }
  if (!animLoopHandle)
  animloop();
  socket.emit('respawn');
}

// check if nick is valid alphanumeric characters (and underscores)
function validNick() {
  var regex = /^\w+$/;
  debug('Regex Test', regex.exec(playerNameInput.value));
  return regex.exec(playerNameInput.value) !== null;
}

window.onload = function() {
  var btn           = document.getElementById('startButton'),
      nickErrorText = document.querySelector('#startMenu .input-error'),
      settingsMenu  = document.getElementById('settingsButton'),
      settings      = document.getElementById('settings'),
      instructions  = document.getElementById('instructions');

  btn.onclick = function () {
    // check if the nick is valid
    if (validNick()) {
      nickErrorText.style.opacity = 0;
      startGame();
    } else {
      nickErrorText.style.opacity = 1;
    }
  };

  settingsMenu.onclick = function () {
    if (settings.style.maxHeight == '300px') {
      settings.style.maxHeight = '0px';
    } else {
      settings.style.maxHeight = '300px';
    }
  };

  playerNameInput.addEventListener('keypress', function (e) {
    var key = e.which || e.keyCode;

    if (key === KEY_ENTER) {
      if (validNick()) {
        nickErrorText.style.opacity = 0;
        startGame();
      } else {
        nickErrorText.style.opacity = 1;
      }
    }
  });
};

// Canvas
var screenWidth = window.innerWidth;
var screenHeight = window.innerHeight;
var gameWidth = 0;
var gameHeight = 0;
var xoffset = -gameWidth;
var yoffset = -gameHeight;

var gameStart = false;
var disconnected = false;
var died = false;
var kicked = false;

// defaults
// TODO break out into GameControls
var continuity = true;
var showChat = true;
var startPingTime = 0;
var toggleMassState = 1;
var backgroundColor = '#f2fbff';

var foodConfig = {
    border: 0,
    borderColor: '#f39c12',
    fillColor: '#f1c40f'
};

var playerConfig = {
    border: 6,
    textColor: '#FFFFFF',
    textBorder: '#000000',
    textBorderSize: 3,
    defaultSize: 30
};

var enemyConfig = {
    border: 5,
    textColor: '#FFFFFF',
    textBorder: '#000000',
    textBorderSize: 3,
    defaultSize: 30
};

var currentPlayer = {
    id: -1,
    nodes: [{
      x: screenWidth / 2,
      y: screenHeight / 2,
    }],
    x: screenWidth / 2,
    y: screenHeight / 2,
    screenWidth: screenWidth,
    screenHeight: screenHeight,
    target: {
      x: screenWidth / 2,
      y: screenHeight / 2
    }
};

var firstLife = true;
var foods = [];
var enemies = [];
var leaderboard = [];
var target = {
  x: currentPlayer.nodes[0].x,
  y: currentPlayer.nodes[0].y
};

var canvas = document.getElementById('cvs');
canvas.width = screenWidth; canvas.height = screenHeight;
canvas.addEventListener('mousemove', gameInput, false);
canvas.addEventListener('mouseout', outOfBounds, false);
canvas.addEventListener('touchstart', touchInput, false);
canvas.addEventListener('touchmove', touchInput, false);

// register when the mouse goes off the canvas
function outOfBounds() {
  if (!continuity) {
    target = { x : 0, y: 0 };
  }
}

var visibleBorderSetting = document.getElementById('visBord');
visibleBorderSetting.onchange = toggleBorder;

var showMassSetting = document.getElementById('showMass');
showMassSetting.onchange = toggleMass;

var continuitySetting = document.getElementById('continuity');
continuitySetting.onchange = toggleContinuity;

var graph = canvas.getContext('2d');

function ChatClient(config) {
  this.commands = {};
  var input     = jQuery('#chatInput'),
      chat      = jQuery('#chatbox'),
      input2;

  jQuery('body').on('keypress', function(e) {
    // console.log("key");
    // console.log(e.keyCode);
    if (e.keyCode === 96) {
      if (showChat === true) {
        showChat = false;
        chat.hide();
      } else {
        showChat = true;
        input.focus().val("");
        chat.show();
      }
      e.preventDefault();
    } else if (showChat === false) {
      if (e.keyCode === 87 || e.keyCode === 119) {
        console.log("asdf");
      }
    }
  });
  input2 = document.getElementById('chatInput');
  input2.addEventListener('keypress', this.sendChat.bind(this));
}

/** template into chat box a new message from a currentPlayer */
ChatClient.prototype.addChatLine = function (name, message) {
  if (mobile) { return; }

  var newline = document.createElement('li');

  // color the chat input appropriately
  newline.className = (name === currentPlayer.name) ? 'me' : 'friend';
  newline.innerHTML = '<b>' + name + '</b>: ' + message;

  this.appendMessage(newline);
};


/** template into chat box a new message from the application */
ChatClient.prototype.addSystemLine = function (message) {
  if (mobile) { return; }
  var newline = document.createElement('li');

  // message will appear in system color
  newline.className = 'system';
  newline.innerHTML = message;

  // place in message log
  this.appendMessage(newline);
};

/** templates the message DOM node into the messsage area */
ChatClient.prototype.appendMessage = function (node) {
  if (mobile) { return; }

  var chatList = document.getElementById('chatList');

  if (chatList.childNodes.length > 10) {
    chatList.removeChild(chatList.childNodes[0]);
  }
  chatList.appendChild(node);
};

/** sends a message or executes a command on the ENTER key */
ChatClient.prototype.sendChat = function (key) {
  var commands = this.commands,
      input = document.getElementById('chatInput');

  key = key.which || key.keyCode;

  if (key === KEY_ENTER) {
    var text = input.value.replace(/(<([^>]+)>)/ig,'');
    if (text !== '') {

      // this is a chat command
      if (text.indexOf('-') === 0) {
        var args = text.substring(1).split(' ');
        if (commands[args[0]]) {
          commands[args[0]].callback(args.slice(1));
        } else {
          this.addSystemLine('Unrecoginised Command: ' + text + ', type -help for more info');
        }

        // just a regular message - send along to server
      } else {
        socket.emit('playerChat', { sender: currentPlayer.name, message: text });
        this.addChatLine(currentPlayer.name, text);
      }

      // reset input
      input.value = '';
    }
  }
};

/** add a new chat command */
ChatClient.prototype.registerCommand = function (name, description, callback) {
  this.commands[name] = {
    description: description,
    callback: callback
  };
};

/** print help of all chat commands available */
ChatClient.prototype.printHelp = function () {
  var commands = this.commands;
  for (var cmd in commands) {
    if (commands.hasOwnProperty(cmd)) {
      this.addSystemLine('-' + cmd + ': ' + commands[cmd].description);
    }
  }
};

var chat = new ChatClient();

// chat command callback functions
function checkLatency() {
  // Ping
  startPingTime = Date.now();
  socket.emit('ping');
}

function toggleDarkMode() {
  var LIGHT = '#f2fbff',
  DARK = '#181818';

  if (backgroundColor === LIGHT) {
    backgroundColor = DARK;
    chat.addSystemLine('Dark mode enabled');
  } else {
    backgroundColor = LIGHT;
    chat.addSystemLine('Dark mode disabled');
  }
}

function toggleBorder(args) {
  if (!borderDraw) {
    borderDraw = true;
    chat.addSystemLine('Showing border');
  } else {
    borderDraw = false;
    chat.addSystemLine('Hiding border');
  }
}

function toggleMass(args) {
  if (toggleMassState === 0) {
    toggleMassState = 1;
    chat.addSystemLine('Mass mode activated!');
  } else {
    toggleMassState = 0;
    chat.addSystemLine('Mass mode deactivated!');
  }
}

function toggleContinuity(args) {
  if (!continuity) {
    continuity = true;
    chat.addSystemLine('Continuity activated!');
  } else {
    continuity = false;
    chat.addSystemLine('Continuity deactivated!');
  }
}

// TODO
// Break out many of these game controls into a separate class

chat.registerCommand('ping', 'Check your latency', function () {
  checkLatency();
});

chat.registerCommand('dark', 'Toggle dark mode', function () {
  toggleDarkMode();
});

chat.registerCommand('border', 'Toggle border', function () {
  toggleBorder();
});

chat.registerCommand('mass', 'View mass', function () {
  toggleMass();
});

chat.registerCommand('continuity', 'Toggle continuity', function () {
  toggleContinuity();
});

chat.registerCommand('help', 'Chat commands information', function () {
  chat.printHelp();
});

chat.registerCommand('login', 'Login as an admin', function (args) {
  socket.emit('pass', args);
});

chat.registerCommand('kick', 'Kick a currentPlayer', function (args) {
  socket.emit('kick', args);
});


// socket stuff
function setupSocket(socket) {
  // Handle ping
  socket.on('pong', function () {
    var latency = Date.now() - startPingTime;
    debug('Latency: ' + latency + 'ms');
    chat.addSystemLine('Ping: ' + latency + 'ms');
  });

  // Handle error
  socket.on('connect_failed', function () {
    socket.close();
    disconnected = true;
  });

  socket.on('disconnect', function () {
    socket.close();
    disconnected = true;
  });

  // Handle connection
  socket.on('welcome', function (playerSettings) {
    currentPlayer              = playerSettings;
    currentPlayer.name         = playerName;
    currentPlayer.screenWidth  = screenWidth;
    currentPlayer.screenHeight = screenHeight;
    currentPlayer.target       = target;
    socket.emit('gotit', currentPlayer);
    gameStart = true;
    debug('Game is started: ' + gameStart);
    if (firstLife === true) {
      chat.addSystemLine('Connected to the game!');
      chat.addSystemLine('Type <b>-help</b> for a list of commands');
      chat.addSystemLine('Use <b>`</b> (Backtick) to toggle menu');
      firstLife = false;
    }
    if (mobile) {
      document.getElementById('gameAreaWrapper').removeChild(document.getElementById('chatbox'));
    }
    else {
      document.getElementById('chatInput').select();
    }
  });

  socket.on('gameSetup', function(data) {
    gameWidth     = data.gameWidth;
    gameHeight    = data.gameHeight;
    currentPlayer = data.currentPlayer;
  });

  socket.on('playerDied', function (data) {
    chat.addSystemLine('Player <b>' + data.killerName + '</b> killed <b>' + data.killedName + '</b>!');
  });

  socket.on('playerDisconnect', function (data) {
    chat.addSystemLine('Player <b>' + data.name + '</b> disconnected!');
  });

  socket.on('playerJoin', function (data) {
    chat.addSystemLine('Player <b>' + data.name + '</b> joined!');
  });

  socket.on('leaderboard', function (data) {
    leaderboard = data.leaderboard;
    var status = 'Players: ' + data.players;
    for (var i = 0; i < leaderboard.length; i++) {
      status += '<br />';
      if (leaderboard[i].id == currentPlayer.id) {
        status += '<span class="me">' + (i + 1) + '. ' + leaderboard[i].name + "</span>";
      } else {
        status += (i + 1) + '. ' + leaderboard[i].name;
      }
    }
    document.getElementById('status').innerHTML = status;
  });

  socket.on('serverMSG', function (data) {
    chat.addSystemLine(data);
  });

  // Chat
  socket.on('serverSendPlayerChat', function (data) {
    chat.addChatLine(data.sender, data.message);
  });

  // Handle movement
  socket.on('serverTellPlayerMove', function (playerNodes, userData, foodsList) {
    var nodes = currentPlayer.nodes,
        i = 0;

    for (i = 0; i < nodes.length; i++) {
      var node    = nodes[i],
          xoffset = node.x - playerNodes[i].x,
          yoffset = node.y - playerNodes[i].y;

      node.x         = playerNodes[i].x;
      node.y         = playerNodes[i].y;
      node.mass      = playerNodes[i].mass;
      node.radius    = playerNodes[i].radius;
      node.xoffset = isNaN(xoffset) ? 0 : xoffset;
      node.yoffset = isNaN(yoffset) ? 0 : yoffset;
    }
    enemies = userData;
    foods   = foodsList;
  });

  // Die
  socket.on('RIP', function () {
    gameStart = false;
    died      = true;
    window.setTimeout(function() {
      document.getElementById('gameAreaWrapper').style.opacity = 0;
      document.getElementById('startMenuWrapper').style.maxHeight = '1000px';
      died = false;

      if (animLoopHandle) {
        window.cancelAnimationFrame(animLoopHandle);
        animLoopHandle = undefined;
      }
    }, 2500);
  });

  socket.on('kick', function (data) {
    gameStart = false;
    reason    = data;
    kicked    = true;
    socket.close();
  });
}

function drawCircle(centerX, centerY, radius, sides) {
  var theta = 0,
      x     = 0,
      y     = 0;

  graph.beginPath();

  for (var i = 0; i < sides; i++) {
    theta = (i / sides) * 2 * Math.PI;
    x     = centerX + radius * Math.sin(theta);
    y     = centerY + radius * Math.cos(theta);
    graph.lineTo(x, y);
  }

  graph.closePath();
  graph.stroke();
  graph.fill();
}

function drawFood(food) {
  if (currentPlayer.nodes === undefined || currentPlayer.nodes.length === 0) { return; }

  graph.strokeStyle = food.color.border || foodConfig.borderColor;
  graph.fillStyle   = food.color.fill || foodConfig.fillColor;
  graph.lineWidth   = foodConfig.border;
  drawCircle(food.x - currentPlayer.nodes[0].x + screenWidth / 2, food.y - currentPlayer.nodes[0].y + screenHeight / 2, food.radius, 9);
}

function setPlayerMass(player) {
  var mass = 0,
      tempMass = 0;
  for (var i = 0; i < player.nodes.length; i++) {
    tempMass = player.nodes[i].mass;
    if (typeof(tempMass) === "number") {
      mass += tempMass;
    }
  }
  player.mass = mass;
}

function drawPlayer() {
  var xValues,
      yValues,
      node,
      circle = {
        x: screenWidth / 2,
        y: screenHeight / 2
      };

  setPlayerMass(currentPlayer);

  for (var i = 0; i < currentPlayer.nodes.length; i++) {
    node = currentPlayer.nodes[i];
    xValues = [
      -node.x + screenWidth / 2,
      gameWidth - node.x + screenWidth / 2
    ];
    yValues = [
      -node.y + screenHeight / 2,
      gameHeight - node.y + screenHeight / 2
    ];
    drawNode(currentPlayer, node, playerConfig, xValues, yValues, circle);
  }
}

function drawEnemy(enemy) {
  var xValues,
      yValues,
      node,
      circle;

  setPlayerMass(enemy);

  for (var i = 0; i < enemy.nodes.length; i++) {
    node = enemy.nodes[i];
    xValues = [
      -node.x - currentPlayer.nodes[0].x + screenWidth/2 + (node.radius/3),
      gameWidth - node.x + gameWidth - currentPlayer.nodes[0].x + screenWidth/2 - (node.radius/3)
    ];
    yValues = [
      -node.y - currentPlayer.nodes[0].y + screenHeight/2 + (node.radius/3),
      gameHeight - node.y + gameHeight - currentPlayer.nodes[0].y + screenHeight/2 - (node.radius/3)
    ];
    circle = {
      x: node.x - currentPlayer.nodes[0].x + screenWidth / 2,
      y: node.y - currentPlayer.nodes[0].y + screenHeight / 2
    };
    drawNode(enemy, node, enemyConfig, xValues, yValues, circle);
  }
}

function drawNode(player, node, config, xValues, yValues, circle) {
  var x        = 0,
      y        = 0,
      points   = 30 + ~~(node.mass/5),
      increase = Math.PI * 2 / points,
      xstore   = [],
      ystore   = [],
      fontSize;

  graph.strokeStyle = 'hsl(' + player.hue + ', 80%, 40%)';
  graph.fillStyle = 'hsl(' + player.hue + ', 70%, 50%)';
  graph.lineWidth = playerConfig.border;

  spin += 0.0;

  for (var i = 0; i < points; i++) {
    x = node.radius * Math.cos(spin) + circle.x;
    y = node.radius * Math.sin(spin) + circle.y;
    x = valueInRange(xValues[0], xValues[1], x);
    y = valueInRange(yValues[0], yValues[1], y);

    spin += increase;

    xstore[i] = x;
    ystore[i] = y;
  }
  /*if (wiggle >= player.radius/ 3) inc = -1;
   *if (wiggle <= player.radius / -3) inc = +1;
   *wiggle += inc;
   */
  for (i = 0; i < points; ++i) {
    if (i === 0) {
      graph.beginPath();
      graph.moveTo(xstore[i], ystore[i]);
    } else if (i > 0 && i < points - 1) {
      graph.lineTo(xstore[i], ystore[i]);
    } else {
      graph.lineTo(xstore[i], ystore[i]);
      graph.lineTo(xstore[0], ystore[0]);
    }
  }
  graph.lineJoin = 'round';
  graph.lineCap  = 'round';
  graph.fill();
  graph.stroke();

  fontSize           = (node.radius / 2);
  graph.lineWidth    = config.textBorderSize;
  graph.miterLimit   = 1;
  graph.lineJoin     = 'round';
  graph.textAlign    = 'center';
  graph.fillStyle    = config.textColor;
  graph.textBaseline = 'middle';
  graph.strokeStyle  = config.textBorder;
  graph.font         = 'bold ' + fontSize + 'px sans-serif';

  if (toggleMassState === 0) {
    graph.strokeText(player.name, screenWidth / 2, screenHeight / 2);
    graph.fillText(player.name, screenWidth / 2, screenHeight / 2);
  } else {
    graph.strokeText(player.name + ' (' + player.mass + ')', circle.x, circle.y);
    graph.fillText(player.name + ' (' + player.mass + ')', circle.x, circle.y);
  }
}

function valueInRange(min, max, value) {
  return Math.min(max, Math.max(min, value));
}

function drawgrid() {
  if (currentPlayer.nodes === undefined || currentPlayer.nodes.length === 0) { return; }

  graph.lineWidth   = 1;
  graph.strokeStyle = '#000';
  graph.globalAlpha = 0.15;
  graph.beginPath();

  for (var x = xoffset - currentPlayer.nodes[0].x; x < screenWidth; x += screenHeight / 18) {
    graph.moveTo(x, 0);
    graph.lineTo(x, screenHeight);
  }

  for (var y = yoffset - currentPlayer.nodes[0].y ; y < screenHeight; y += screenHeight / 18) {
    graph.moveTo(0, y);
    graph.lineTo(screenWidth, y);
  }

  graph.stroke();
  graph.globalAlpha = 1;
}

function drawborder() {
  graph.strokeStyle = playerConfig.borderColor;

  if (currentPlayer.nodes === undefined || currentPlayer.nodes.length === 0) { return; }

  // Left-vertical
  if (currentPlayer.nodes[0].x <= screenWidth/2) {
    graph.beginPath();
    graph.moveTo(screenWidth/2 - currentPlayer.nodes[0].x, 0 ? currentPlayer.nodes[0].y > screenHeight/2 : screenHeight/2 - currentPlayer.nodes[0].y);
    graph.lineTo(screenWidth/2 - currentPlayer.nodes[0].x, gameHeight + screenHeight/2 - currentPlayer.nodes[0].y);
    graph.strokeStyle = '#000000';
    graph.stroke();
  }

  // Top-horizontal
  if (currentPlayer.nodes[0].y <= screenHeight/2) {
    graph.beginPath();
    graph.moveTo(0 ? currentPlayer.nodes[0].x > screenWidth/2 : screenWidth/2 - currentPlayer.nodes[0].x, screenHeight/2 - currentPlayer.nodes[0].y);
    graph.lineTo(gameWidth + screenWidth/2 - currentPlayer.nodes[0].x, screenHeight/2 - currentPlayer.nodes[0].y);
    graph.strokeStyle = '#000000';
    graph.stroke();
  }

  // Right-vertical
  if (gameWidth - currentPlayer.nodes[0].x <= screenWidth/2) {
    graph.beginPath();
    graph.moveTo(gameWidth + screenWidth/2 - currentPlayer.nodes[0].x, screenHeight/2 - currentPlayer.nodes[0].y);
    graph.lineTo(gameWidth + screenWidth/2 - currentPlayer.nodes[0].x, gameHeight + screenHeight/2 - currentPlayer.nodes[0].y);
    graph.strokeStyle = '#000000';
    graph.stroke();
  }

  // Bottom-horizontal
  if (gameHeight - currentPlayer.nodes[0].y <= screenHeight/2) {
    graph.beginPath();
    graph.moveTo(gameWidth + screenWidth/2 - currentPlayer.nodes[0].x, gameHeight + screenHeight/2 - currentPlayer.nodes[0].y);
    graph.lineTo(screenWidth/2 - currentPlayer.nodes[0].x, gameHeight + screenHeight/2 - currentPlayer.nodes[0].y);
    graph.strokeStyle = '#000000';
    graph.stroke();
  }
}

function gameInput(mouse) {
  target.x = mouse.clientX - screenWidth / 2;
  target.y = mouse.clientY - screenHeight / 2;
}

function touchInput(touch) {
  touch.preventDefault();
  touch.stopPropagation();
  target.x = touch.touches[0].clientX - screenWidth / 2;
  target.y = touch.touches[0].clientY - screenHeight / 2;
}

window.requestAnimFrame = (function() {
  return  window.requestAnimationFrame       ||
          window.webkitRequestAnimationFrame ||
          window.mozRequestAnimationFrame    ||
          window.msRequestAnimationFrame     ||
          function( callback ) {
              window.setTimeout(callback, 1000 / 60);
          };
})();

window.cancelAnimFrame = (function(handle) {
  return  window.cancelAnimationFrame     ||
          window.mozCancelAnimationFrame;
})();

function animloop() {
  animLoopHandle = window.requestAnimFrame(animloop);
  gameLoop();
}

function gameLoop() {
  if (died) {
    graph.fillStyle = '#333333';
    graph.fillRect(0, 0, screenWidth, screenHeight);

    graph.textAlign = 'center';
    graph.fillStyle = '#FFFFFF';
    graph.font      = 'bold 30px sans-serif';
    graph.fillText('You died!', screenWidth / 2, screenHeight / 2);
  }
  else if (!disconnected) {
    if (gameStart) {
      graph.fillStyle = backgroundColor;
      graph.fillRect(0, 0, screenWidth, screenHeight);
      drawgrid();

      foods.forEach(function(food) {
        drawFood(food);
      });

      if (borderDraw) {
        drawborder();
      }

      for (var i = 0; i < enemies.length; i++) {
        // if (enemies[i].mass <= currentPlayer.mass)
        drawEnemy(enemies[i]);
      }

      drawPlayer();

      for (var j = 0; j < enemies.length; j++) {
        if (enemies[j].mass > currentPlayer.mass)
        drawEnemy(enemies[j]);
      }

      socket.emit('0', target); // playerSendTarget Heartbeat
    } else {
      graph.fillStyle = '#333333';
      graph.fillRect(0, 0, screenWidth, screenHeight);

      graph.textAlign = 'center';
      graph.fillStyle = '#FFFFFF';
      graph.font      = 'bold 30px sans-serif';
      graph.fillText('Game Over!', screenWidth / 2, screenHeight / 2);
    }
  } else {
    graph.fillStyle = '#333333';
    graph.fillRect(0, 0, screenWidth, screenHeight);

    graph.textAlign = 'center';
    graph.fillStyle = '#FFFFFF';
    graph.font      = 'bold 30px sans-serif';
    if (kicked) {
      if (reason !== '') {
        graph.fillText('You were kicked for reason:', screenWidth / 2, screenHeight / 2 - 20);
        graph.fillText(reason, screenWidth / 2, screenHeight / 2 + 20);
      }
      else {
        graph.fillText('You were kicked!', screenWidth / 2, screenHeight / 2);
      }
    }
    else {
      graph.fillText('Disconnected!', screenWidth / 2, screenHeight / 2);
    }
  }
}

window.addEventListener('resize', function() {
  currentPlayer.screenWidth  = canvas.width  = screenWidth  = window.innerWidth;
  currentPlayer.screenHeight = canvas.height = screenHeight = window.innerHeight;
  socket.emit('windowResized', { screenWidth: screenWidth, screenHeight: screenHeight });
}, true);
