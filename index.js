const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');
const server = http.createServer();
const wss = new WebSocket.Server({ noServer: true });
var url = require('url');
var Db=[]

async function find_by_id(id){
for (var i = 0; i < Db.length; i++) {
   if(Db[i].id===id){
    return Db[i]
   }
}
return false
}

async function generate_id() {
    const id = new Promise((resolve, reject) => {
        crypto.randomBytes(16, async function(ex, buffer) {
            if (ex) {
                reject("error");
            }
            let id = buffer.toString("base64").replace(/\/|=|[+]/g, '')
            let result = await find_by_id(id) //check if id exists
            if (!result) {
                resolve(id);
            } else {
                let id_1 = await generate_id()
                resolve(id_1)
            }
        });
    });
    return id;
}

async function authenticate(request, cb) {
  console.log("=====queryData=====")
  let queryData = url.parse(request.url, true).query;
  console.log(queryData);
  console.log("===================")
  let user_id = queryData.user_id;
  let found = await find_by_id(user_id);
  let client;
  let err = false;
  if (found) {
    client = found;
  } else {
    let id = await generate_id();
    client = { id: id, username: null };
    Db.push(client);
  }
  cb(err, client);
}

function broadcast(msg){
  console.log(`Sent to ${wss.clients.size} clients`)
  wss.clients.forEach(function each(client) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(msg));
      }
    });
}

function send_msg_by_id(msg,id){
  for (let client of wss.clients){
     if (client.readyState === WebSocket.OPEN && client.data.id===id) {
         client.send(JSON.stringify(msg));
         break;
      }
  }
}



const check_clients_alive = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false){console.log("not responding. killing client");return ws.terminate();}
    ws.isAlive = false;
    ws.send('1')
  });
}, 5000);

const update_peer_list = setInterval(function ping() {
  let ids=[]
  wss.clients.forEach(function each(ws) {
    ids.push(ws.data.id)
  })
  let msg={type:"update_peer_list",data:ids}
  broadcast(msg)
}, 2000);


wss.on("connection", function connection(ws) {
  ws.isAlive = true;
  ws.on("message", function message(data) {
    if (data === "1" || data === "2") {
      if (data === "2") {
        ws.send("2");
      }
      ws.isAlive = true;
      return;
    }
    try {
      var msg = JSON.parse(data);
      console.log(msg);
      switch (msg.type) {
        case "signal_msg":
          send_msg_by_id(msg,msg.recipient_id)
          break;
      }
    } catch (e) {
      console.log(e);
    }
  });

  ws.on("close", function () {
    console.log(`${JSON.stringify(ws.data)} user disconnected`);
  });
});



server.on('upgrade', async function upgrade(request, socket, head) {
  authenticate(request, (err, client) => {
    if (err || !client) {
      socket.destroy();
      console.log("auth failed")
      return;
    }
    console.log("auth succeeded")
    wss.handleUpgrade(request, socket, head, function done(ws) {
      ws.data=client
      wss.emit('connection', ws);
      ws.send(JSON.stringify({type:"registration",data:client}))
    });

  });
});


server.listen(8080);
console.log("server started at port 8080")