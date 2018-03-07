# STOMP Protocol for NodeJS

An implementation of the [STOMP Protocol](https://stomp.github.io/) for NodeJS, both client-side & server-side. It does not implement a fully functional broker, but it's intended as an API for building complex asynchronous applications based on the STOMP protocol.

## Ready for TypeScript

I developed this module using Typescript and the npm package is already provided with `d.ts` typings.

## Installation

Run npm to install the package:

```shell
npm install node-stomp-protocol --save
```

Import the module using the standard syntax:

```typescript
import * as stomp from 'node-stomp-protocol';
```

### Client example

The following example shows how to connect to a STOMP server using this library. We use `net.Socket` here, but the library is ready for `WebSocket`s, too.

```TypeScript
import { StompHeaders, StompError, StompServerCommandListener, createStompClientSession } from 'node-stomp-protocol';
import { Socket, createConnection } from 'net';

const listener: StompServerCommandListener = { // 1) define a listener for server-sent frames.
    connected(headers?: StompHeaders): Promise<void> {
        console.log('Connected!', headers);
    },
    message(headers?: StompHeaders, body?: string): Promise<void> {
        console.log('Message!', body, headers);
    },
    receipt(headers?: StompHeaders): Promise<void> {
        console.log('Receipt!', headers);
    },
    error(headers?: StompHeaders, body?: string): Promise<void> {
        console.log('Error!', headers, body);
    },
    onProtocolError(error: StompError) {
        console.log('Protocol error!', error);
    },
    onEnd() {
        console.log('End!');
    }
};

const socket = createConnection(9999, '127.0.0.1'); // 2) Open raw TCP socket to the server.

const client = createStompClientSession(socket, listener); // 3) Start a STOMP Session over the TCP socket.

client.connect({login:'user', passcode:'pass'}).catch(console.error); // 4) Send the first frame!
```

### Server example

```TypeScript
import { StompHeaders, StompError, StompClientCommandListener, createStompServerSession } from 'node-stomp-protocol';
import { Socket, createServer } from 'net';

function testServer(socket: Socket) { // 1) create a listener for incoming raw TCP connections.

    const listener: StompClientCommandListener = { // 2) define a listener for client-sent frames.

        connect(headers?: StompHeaders): Promise<void> {
            console.log('Connect!', headers);
            if (headers && headers.login === 'user' && headers.passcode === 'pass') {
                server.connected({ version: '1.2', server: 'MyServer/1.8.2' }).catch(console.error);
            } else {
                server.error({ message: 'Invalid login data' }, 'Invalid login data').catch(console.error);
            }
        },
        send(headers?: StompHeaders, body?: string): Promise<void> {
            console.log('Send!', body, headers);
        },
        subscribe(headers?: StompHeaders): Promise<void> {
            console.log('subscription done to ' + (headers && headers.destination));
        },
        unsubscribe(headers?: StompHeaders): Promise<void> {
            console.log('unsubscribe', headers);
        },
        begin(headers?: StompHeaders): Promise<void> {
            console.log('begin', headers);
        },
        commit(headers?: StompHeaders): Promise<void> {
            console.log('commit', headers);
        },
        abort(headers?: StompHeaders): Promise<void> {
            console.log('abort', headers);
        },
        ack(headers?: StompHeaders): Promise<void> {
            console.log('ack', headers);
        },
        nack(headers?: StompHeaders): Promise<void> {
            console.log('nack', headers);
        },
        disconnect(headers?: StompHeaders): Promise<void> {
            console.log('Disconnect!', headers);
        },
        onProtocolError(error: StompError) {
            console.log('Protocol error!', error);
        },
        onEnd() {
            console.log('End!');
        }
    };

    const server = createStompServerSession(socket, listener);  // 3) Start a STOMP Session over the TCP socket.
}

const server = createServer(testServer); // 4) Create a TCP server

server.listen(9999, 'localhost'); // 5) Listen for incoming connections
```

## Credits

This project includes some code by [node-stomp-client](https://github.com/easternbloc/node-stomp-client).

## License

Released with MIT License.
