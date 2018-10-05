import { StompHeaders, StompError, StompConfig } from "./model";
import { StompClientCommandListener } from "./protocol";
import { StompServerSessionLayer } from "./session";
import { log, counter, GenericSocket } from "./utils";
import { openStream } from "./stream";
import { StompFrameLayer } from "./frame";

export type SessionIdGenerator = () => string; //TODO: let the user choice the ID generation strategy.

export interface StompBrokerListener<S extends GenericSocket> {

    creatingSession(sessionId: string, socket: S, done: (err?: Error) => void): void;

    //closingSession(sessionId: string, socket: S): void

    sessionError(sessionId: string, error: Error): void

    connecting(sessionId: string, headers: StompHeaders, done: (err?: StompError) => void): void;

    incomingMessage(sessionId: string, headers: StompHeaders | undefined, body: string | undefined, done: (err?: StompError) => void): void;


}



export class StompBrokerLayer<S extends GenericSocket> {

    private readonly nextSessionId = counter(); //TODO: let the user choice the ID generation strategy.

    readonly sessions = new Map<string, StompServerSessionLayer>();

    constructor(readonly listener: StompBrokerListener<S>, readonly config?: StompConfig) { }

    public accept(socket: S) {
        const sessionId = this.nextSessionId(); //TODO: validate session ID before using it (in case of custom generation strategy)
        this.listener.creatingSession(sessionId, socket, (err?: Error) => this.createSession(sessionId, socket, err));
    }

    private createSession(sessionId: string, socket: S, err?: Error) {
        if (err) {
            log.debug("StompBrokerLayer: error while creating session %s: %O", sessionId, err);
        } else {
            const streamLayer = openStream(socket);
            const frameLayer = new StompFrameLayer(streamLayer);
            frameLayer.headerFilter = this.config && this.config.headersFilter || frameLayer.headerFilter;

            const clientListener = new BrokerClientCommandListener(this, sessionId);
            const session = new StompServerSessionLayer(frameLayer, clientListener);

            session.internalErrorHandler = (err) => this.listener.sessionError(sessionId, err);

            session.data.id = sessionId;
            this.sessions.set(sessionId, session);
        }
    }

}




const emptyHeaders = Object.seal({});

class BrokerClientCommandListener<S extends GenericSocket> implements StompClientCommandListener {

    constructor(private readonly broker: StompBrokerLayer<S>, private readonly sessionId: string) { }

    get session() { return this.broker.sessions.get(this.sessionId)! };

    connect(headers?: StompHeaders): void {
        this.broker.listener.connecting(this.sessionId, headers || emptyHeaders, (err) => this.connectCallback(err));
    }

    private connectCallback(err?: StompError) {
        const session = this.session;
        if (err) {
            log.debug("StompBrokerLayer: error while connecting session %s: %O", session.data.id, err);
            session.error({ message: err.message }, err.details)
                .catch(session.internalErrorHandler);
        } else {
            session.connected({ version: session.protocolVersion, server: 'StompBroker/1.0.0' })  //TODO: configure broker name
                .catch(session.internalErrorHandler);
        }
    }


    send(headers?: StompHeaders, body?: string): void {
        const session = this.session;
        this.broker.listener.incomingMessage(this.sessionId, headers, body, (err) => this.receiptHandler(err));

    }

    private receiptHandler(err?: StompError) {

    }

    subscribe(headers?: StompHeaders): void {

    }

    unsubscribe(headers?: StompHeaders): void {

    }

    begin(headers?: StompHeaders): void {

    }

    commit(headers?: StompHeaders): void {

    }

    abort(headers?: StompHeaders): void {

    }


    ack(headers?: StompHeaders): void {

    }

    nack(headers?: StompHeaders): void {

    }

    disconnect(headers?: StompHeaders): void {

    }

    onProtocolError(error: StompError): void {
    }

    onEnd(): void {
    }



}


interface BrokerSession<S extends GenericSocket> {
    socket: S;
    stompSession: StompServerSessionLayer;
    // bindings: Map<string, SubscriptionBinding>; //this is an implementation-specific detail. maybe we need generic here?
}
