import "mocha";
import { expect } from 'chai';
import * as WebSocket from 'ws';
import { StompServerSessionLayer, StompClientSessionLayer } from '../src/session';
import {
    StompClientCommandListener, StompServerCommandListener
} from "../src/protocol";
import { setTimeout } from "timers";
import { noopFn } from "./helpers";
import { createStompServerSession, StompConfig, createStompClientSession } from "../src";


describe("STOMP Heart beating", function() {
    this.timeout(15000);

    const heartbeatMsg = "\0";

    let server: WebSocket.Server;
    let socket: WebSocket;
    let clientSocket: WebSocket;

    let serverSession: StompServerSessionLayer;
    let serverListener: StompServerCommandListener;

    let clientSession: StompClientSessionLayer;
    let clientListener: StompClientCommandListener;

    beforeEach((done) => {

        clientListener = {
            onProtocolError: (_err) => { },
            onEnd: noopFn
        } as StompClientCommandListener;

        server = new WebSocket.Server({ port: 58999 }, () => {
            clientSocket = new WebSocket("ws://localhost:58999/ws");
            clientSocket.on("open", done);
        });
        server.on("connection", _socket => {
            socket = _socket;
        });

        serverListener = {
            onProtocolError: (_err) => { },
            onEnd: noopFn
        } as StompServerCommandListener;

    });

    afterEach((done) => {
        clientSocket.close();
        server.close(done);
    });

    it("should perform duplex heart-beat every 50ms", (done) => {
        let clientHeartbeatIncomingCount = 0;
        let serverHeartbeatIncomingCount = 0;

        const serverConfig: StompConfig = {
            heartbeat: {
                outgoingPeriod: 50,
                incomingPeriod: 50
            }
        };

        const clientConfig: StompConfig = {
            heartbeat: {
                outgoingPeriod: 30,
                incomingPeriod: 30
            }
        };

        socket.on("message", (data) => {
            if (data.toString() === heartbeatMsg) {
                serverHeartbeatIncomingCount++;
            }
        });

        clientSocket.on("message", (data) => {
            if (data.toString() === heartbeatMsg) {
                clientHeartbeatIncomingCount++;
            }
        });

        serverListener.onEnd = () => {
            expect(clientHeartbeatIncomingCount).eq(3);
            expect(serverHeartbeatIncomingCount).eq(3);
            done();
        };

        setTimeout(() => {
            clientSession.disconnect();
        }, 180);

        serverSession = createStompServerSession(socket, clientListener, serverConfig);
        clientSession = createStompClientSession(clientSocket, serverListener, clientConfig);

        clientListener.connect = () => serverSession.connected({});
        clientSession.connect({});
    });



    it("should not perform heartbeat", (done) => {
        let clientHeartbeatIncomingCount = 0;
        let serverHeartbeatIncomingCount = 0;

        const serverConfig: StompConfig = {
            heartbeat: {
                outgoingPeriod: 0,
                incomingPeriod: 0
            }
        };

        const clientConfig: StompConfig = {
            heartbeat: {
                outgoingPeriod: 0,
                incomingPeriod: 0
            }
        };

        socket.on("message", (data) => {
            if (data.toString() === heartbeatMsg) {
                serverHeartbeatIncomingCount++;
            }
        });

        clientSocket.on("message", (data) => {
            if (data.toString() === heartbeatMsg) {
                clientHeartbeatIncomingCount++;
            }
        });

        serverListener.onEnd = () => {
            expect(clientHeartbeatIncomingCount).eq(0);
            expect(serverHeartbeatIncomingCount).eq(0);
            done();
        };

        setTimeout(() => {
            clientSession.disconnect();
        }, 100);

        serverSession = createStompServerSession(socket, clientListener, serverConfig);
        clientSession = createStompClientSession(clientSocket, serverListener, clientConfig);

        clientListener.connect = () => serverSession.connected({});
        clientSession.connect({});
    });

    it("should perform one-direction heartbeat", (done) => {
        let clientHeartbeatIncomingCount = 0;
        let serverHeartbeatIncomingCount = 0;

        const serverConfig: StompConfig = {
            heartbeat: {
                outgoingPeriod: 0,
                incomingPeriod: 50
            }
        };

        const clientConfig: StompConfig = {
            heartbeat: {
                outgoingPeriod: 50,
                incomingPeriod: 50
            }
        };

        socket.on("message", (data) => {
            if (data.toString() === heartbeatMsg) {
                serverHeartbeatIncomingCount++;
            }
        });

        clientSocket.on("message", (data) => {
            if (data.toString() === heartbeatMsg) {
                clientHeartbeatIncomingCount++;
            }
        });

        serverListener.onEnd = () => {
            expect(clientHeartbeatIncomingCount).eq(0);
            expect(serverHeartbeatIncomingCount).eq(2);
            done();
        };

        setTimeout(() => {
            clientSession.disconnect();
        }, 140);

        serverSession = createStompServerSession(socket, clientListener, serverConfig);
        clientSession = createStompClientSession(clientSocket, serverListener, clientConfig);

        clientListener.connect = () => serverSession.connected({});
        clientSession.connect({});
    });


    it("should close connection due to a error and release timers", (done) => {
        let clientHeartbeatIncomingCount = 0;
        let serverHeartbeatIncomingCount = 0;

        const serverConfig: StompConfig = {
            heartbeat: {
                outgoingPeriod: 50,
                incomingPeriod: 50
            }
        };

        const clientConfig: StompConfig = {
            heartbeat: {
                outgoingPeriod: 50,
                incomingPeriod: 50
            }
        };

        socket.on("message", (data) => {
            if (data.toString() === heartbeatMsg) {
                serverHeartbeatIncomingCount++;
            }
        });

        clientSocket.on("message", (data) => {
            if (data.toString() === heartbeatMsg) {
                clientHeartbeatIncomingCount++;
            }
        });

        serverListener.connected = (headers) => {
            setTimeout(() => {
                serverSession.error({});
            }, 190);
        };

        clientListener.connect = () => serverSession.connected({});

        clientSession = createStompClientSession(clientSocket, serverListener, clientConfig);

        clientSession.frameLayer.emitter.on("end", () => {

            expect(clientSession.frameLayer.heartbeat.outgoingTimer).eq(null);
            expect(clientSession.frameLayer.heartbeat.incomingTimer).eq(null);
            expect(serverSession.frameLayer.heartbeat.outgoingTimer).eq(null);
            expect(serverSession.frameLayer.heartbeat.incomingTimer).eq(null);

            expect(clientHeartbeatIncomingCount).eq(3);
            expect(serverHeartbeatIncomingCount).eq(3);
            done();
        });

        serverSession = createStompServerSession(socket, clientListener, serverConfig);

        clientSession.connect({});
    });

    it("should close connection if no heartbeat from other side", (done) => {
        let clientHeartbeatIncomingCount = 0;
        let serverHeartbeatIncomingCount = 0;

        const serverConfig: StompConfig = {
            heartbeat: {
                outgoingPeriod: 50,
                incomingPeriod: 50
            }
        };

        const clientConfig: StompConfig = {
            heartbeat: {
                outgoingPeriod: 50,
                incomingPeriod: 50
            }
        };

        socket.on("message", (data) => {
            if (data.toString() === heartbeatMsg) {
                serverHeartbeatIncomingCount++;
            }
        });

        clientSocket.on("message", (data) => {
            if (data.toString() === heartbeatMsg) {
                clientHeartbeatIncomingCount++;
            }
        });

        serverListener.connected = (headers) => {
            setTimeout(() => {
                serverSession.frameLayer.heartbeat.releaseTimers();
            }, 20);
        };

        clientListener.connect = () => serverSession.connected({});

        clientSession = createStompClientSession(clientSocket, serverListener, clientConfig);

        clientSession.frameLayer.emitter.on("error", (data) => {
            expect(serverHeartbeatIncomingCount).gt(clientHeartbeatIncomingCount);

            expect(clientSession.frameLayer.heartbeat.outgoingTimer).eq(null);
            expect(clientSession.frameLayer.heartbeat.incomingTimer).eq(null);
            expect(serverSession.frameLayer.heartbeat.outgoingTimer).eq(null);
            expect(serverSession.frameLayer.heartbeat.incomingTimer).eq(null);

            done();
        });

        serverSession = createStompServerSession(socket, clientListener, serverConfig);

        clientSession.connect({});
    });

});
