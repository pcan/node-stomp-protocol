import { StompHeaders, StompError, StompConfig } from "./model";
import { StompClientCommandListener, StompProtocolHandlerV10 } from "./protocol";
import { StompServerSessionLayer } from "./session";
import { log, counter, GenericSocket } from "./utils";
import { openStream } from "./stream";
import { StompFrameLayer } from "./frame";

export type SessionIdGenerator = () => string; //TODO: let the user choice the ID generation strategy.

export interface StompBrokerListener {

    sessionEnd(sessionId: string): void

    sessionError(sessionId: string, error: Error): void

    connecting(sessionId: string, headers: StompHeaders, done: (err?: StompError) => void): void;

    incomingMessage(sessionId: string, headers: StompHeaders, body: string | undefined, done: (err?: StompError) => void): void;

    subscribing(sessionId: string, subscription: Subscription, done: (err?: StompError) => void): void;

    unsubscribing(sessionId: string, subscription: Subscription, done: (err?: StompError) => void): void;

}

export interface StompBrokerCommands {

    /**
     * Accept an incoming connection and creates a STOMP session
     * @param socket    Client Socket or WebSocket
     * @return New Session ID
     */
    accept<S extends GenericSocket>(socket: S): string;

    /**
     * Iterates all active subscriptions for the given destination, using the given callback
     * @param  destination The destination
     * @param  callback    The callback to execute for each subscription; to break the iteration, return false.
     */
    forDestination(destination: string, callback: (sessionId: string, subscription: Subscription) => boolean | void): void;


}


export class StompBrokerLayer implements StompBrokerCommands { //TODO: factory method

    private readonly nextSessionId = counter(); //TODO: let the user choice the Session ID generation strategy.

    readonly sessions = new Map<string, StompServerSessionLayer>();
    readonly subscriptions = new BrokerSubscriptionsRegistry();

    constructor(readonly listener: StompBrokerListener, readonly config?: StompConfig) { }

    public accept<S extends GenericSocket>(socket: S): string {
        const sessionId = this.nextSessionId(); //TODO: validate session ID before using it (in case of custom generation strategy)
        const streamLayer = openStream(socket);
        const frameLayer = new StompFrameLayer(streamLayer);
        frameLayer.headerFilter = this.config && this.config.headersFilter || frameLayer.headerFilter;

        const clientListener = new BrokerClientCommandListener(this, sessionId);
        const session = new StompServerSessionLayer(frameLayer, clientListener);
        clientListener.session = session;

        session.internalErrorHandler = (err) => this.listener.sessionError(sessionId, err);

        session.data.id = sessionId;
        this.sessions.set(sessionId, session);
        return sessionId;
    }

    public forDestination(destination: string, callback: (sessionId: string, subscription: Subscription) => boolean | void) {
        this.subscriptions.forDestination(destination, callback);
    }

}


class BrokerClientCommandListener implements StompClientCommandListener {

    session!: StompServerSessionLayer; // Server-side session for a connected client

    private readonly nextSubscriptionId = counter();  //TODO: let the user choice the Subscription ID generation strategy.

    constructor(private readonly broker: StompBrokerLayer, private readonly sessionId: string) { }

    connect(headers: StompHeaders): void {
        this.broker.listener.connecting(this.sessionId, headers, (err) => this.connectCallback(err));
    }

    private connectCallback(err?: StompError) {
        const session = this.session;
        if (err) {
            log.debug("StompBrokerLayer: error while connecting session %s: %O", session.data.id, err);
            this.sendErrorFrame(err);
        } else {
            session.connected({ version: session.protocolVersion, server: 'StompBroker/1.0.0' })  //TODO: configure broker name
                .catch(session.internalErrorHandler);
        }
    }

    private sendErrorFrame(err: StompError, headers?: StompHeaders) {
        headers = headers || {};
        headers.message = err.message;
        this.session.error(headers, err.details).catch(this.session.internalErrorHandler);
    }

    send(headers: StompHeaders, body?: string): void {
        const callback = (err?: StompError) => this.receiptCallback(headers, err);
        this.broker.listener.incomingMessage(this.sessionId, headers, body, callback);
    }

    private receiptCallback(headers: StompHeaders, err?: StompError) {
        const receipt = typeof headers.receipt === 'string' ? headers.receipt : undefined;
        if (err) {
            this.sendErrorFrame(err, receipt ? { 'receipt-id': receipt } : undefined);
        } else if (receipt) {
            this.session.receipt({ 'receipt-id': receipt });
        }
    }

    subscribe(headers: StompHeaders): void {
        if (this.session.protocolVersion == StompProtocolHandlerV10.version && !headers.id) {
            // version 1.0 does not require subscription id header, we must generate it.
            headers.id = 'sub_' + this.nextSubscriptionId();
        }
        const subscription: Subscription = Object.seal({
            id: headers.id,
            destination: headers.destination,
            ack: headers.ack || 'auto'
        });
        const callback = (err?: StompError) => this.subscribeCallback(headers, subscription, err);
        this.broker.listener.subscribing(this.sessionId, subscription, callback);
    }

    private subscribeCallback(headers: StompHeaders, subscription: Subscription, err?: StompError) {
        if (!err) {
            this.broker.subscriptions.add(this.sessionId, subscription);
        }
        return this.receiptCallback(headers, err);
    }

    unsubscribe(headers: StompHeaders): void {
        let subscription!: Subscription;
        if (headers.id) {
            subscription = this.broker.subscriptions.get(this.sessionId, headers.id)!;
        } else {
            // Fallback for version 1.0: get the first available subscription for the given destination.
            this.broker.subscriptions.forSessionDestination(this.sessionId, headers.destination, (sub) => {
                subscription = sub;
                return false;
            });
        }

        if (subscription) {
            const callback = (err?: StompError) => this.unsubscribeCallback(headers, subscription, err);
            this.broker.listener.unsubscribing(this.sessionId, subscription, callback);
        } else {
            log.debug("StompBrokerLayer: error while unsubscribing, cannot find subscription for session %s: %O", this.sessionId, headers);
            this.sendErrorFrame(new StompError("Cannot unsubscribe: unknown subscription ID or destination."));
        }
    }

    private unsubscribeCallback(headers: StompHeaders, subscription: Subscription, err?: StompError) {
        if (!err) {
            this.broker.subscriptions.remove(this.sessionId, subscription.id);
        }
        return this.receiptCallback(headers, err);
    }

    begin(headers: StompHeaders): void {

    }

    commit(headers: StompHeaders): void {

    }

    abort(headers: StompHeaders): void {

    }


    ack(headers: StompHeaders): void {

    }

    nack(headers: StompHeaders): void {

    }

    disconnect(headers: StompHeaders): void {
        //TODO: handle receipt
    }

    onProtocolError(error: StompError): void {
    }

    onEnd(): void {
    }



}

interface Subscription {
    id: string,
    destination: string,
    ack: string
}


interface BrokerSession<S extends GenericSocket> {
    socket: S;
    stompSession: StompServerSessionLayer;
    // bindings: Map<string, SubscriptionBinding>; //this is an implementation-specific detail. maybe we need generic here?
}


class BrokerSubscriptionsRegistry {

    private readonly bySessionId = new Map<string, SessionSubscriptionsRegistry>();
    private readonly byDestination = new Map<string, SessionSubscriptionsRegistry[]>();

    public add(sessionId: string, subscription: Subscription) {
        let sessionReg = this.bySessionId.get(sessionId);
        if (!sessionReg) {
            this.bySessionId.set(sessionId, sessionReg = new SessionSubscriptionsRegistry(sessionId));
        }
        sessionReg.add(subscription);
        let arr = this.byDestination.get(subscription.destination);
        if (!arr) {
            this.byDestination.set(subscription.destination, arr = []);
        }
        arr.push(sessionReg);
    }

    public get(sessionId: string, subscriptionId: string) {
        const reg = this.bySessionId.get(sessionId);
        return reg && reg.get(subscriptionId);
    }

    public remove(sessionId: string, subscriptionId: string) {
        const reg = this.bySessionId.get(sessionId);
        return reg && reg.remove(subscriptionId);
    }

    public forSessionDestination(sessionId: string, destination: string, callback: (subscription: Subscription) => boolean | void): void {
        const reg = this.bySessionId.get(sessionId);
        if (reg) {
            reg.forDestination(destination, sub => callback(sub) || true);
        }
    }

    public forDestination(destination: string, callback: (sessionId: string, subscription: Subscription) => boolean | void): void {
        const sessionRegs = this.byDestination.get(destination);
        if (sessionRegs) {
            sessionRegs.every(reg => reg.forDestination(destination, callback.bind(null, reg.sessionId)) || true);
        }
    }

    // TODO: filter method

}


class SessionSubscriptionsRegistry {

    private readonly byId = new Map<string, Subscription>();
    private readonly byDestination = new Map<string, Subscription[]>();

    constructor(readonly sessionId: string) { }

    public add(subscription: Subscription) {
        if (this.byId.has(subscription.id)) {
            throw new Error(`Subscription ID ${subscription.id} already found for session ${this.sessionId}.`);
        }
        this.byId.set(subscription.id, subscription);
        let arr = this.byDestination.get(subscription.destination);
        if (!arr) {
            this.byDestination.set(subscription.destination, arr = []);
        }
        arr.push(subscription);
    }

    public remove(id: string): boolean {
        const subscription = this.byId.get(id);
        if (subscription) {
            this.byId.delete(id);
            const arr = this.byDestination.get(subscription.destination)!;
            arr.splice(arr.findIndex(s => s.id === id), 1);
        }
        return !!subscription;
    }

    public get(id: string) {
        const sub = this.byId.get(id);
        return sub && Object.seal(Object.assign({}, sub));
    }

    public forDestination(destination: string, callback: (subscription: Subscription) => boolean) {
        const arr = this.byDestination.get(destination);
        if (arr) {
            return arr.every(callback);
        }
        return true;
    }

    // TODO: filter method

}
