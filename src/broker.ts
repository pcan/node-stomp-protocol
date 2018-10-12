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

    connecting(sessionId: string, headers: StompHeaders): Promise<void>;

    disconnecting(sessionId: string, headers: StompHeaders): Promise<void>;

    incomingMessage(sessionId: string, headers: StompHeaders, body: string | undefined): Promise<void>;

    subscribing(sessionId: string, subscription: Subscription): Promise<void>;

    unsubscribing(sessionId: string, subscription: Subscription): Promise<void>;

    acknowledging(sessionId: string, acknowledge: Acknowledge): Promise<void>;

    beginningTransaction(sessionId: string, transactionId: string): Promise<void>;

    committingTransaction(sessionId: string, transactionId: string): Promise<void>;

    cancellingTransaction(sessionId: string, transactionId: string): Promise<void>;

}

export interface StompBrokerLayer {

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
    subscriptionsByDestination(destination: string, callback: (sessionId: string, subscription: Subscription) => boolean | void): void;




}


export class StompBrokerLayerImpl implements StompBrokerLayer { //TODO: factory method

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

        session.sendErrorHandler = (err) => this.listener.sessionError(sessionId, err);

        session.data.id = sessionId;
        this.sessions.set(sessionId, session);
        return sessionId;
    }

    public subscriptionsByDestination(destination: string, callback: (sessionId: string, subscription: Subscription) => boolean | void) {
        this.subscriptions.forDestination(destination, callback);
    }

    public sessionEnd(sessionId: string) {
        this.subscriptions.remove(sessionId);
        this.sessions.delete(sessionId);
    }

}


class BrokerClientCommandListener implements StompClientCommandListener {

    session!: StompServerSessionLayer; // Server-side session for a connected client

    private readonly nextSubscriptionId = counter();  //TODO: let the user choice the Subscription ID generation strategy.
    private readonly sessionError = (err: any) => this.broker.listener.sessionError(this.sessionId, err);
    private readonly transactions = new Set<string>();

    constructor(private readonly broker: StompBrokerLayerImpl, private readonly sessionId: string) { }

    connect(headers: StompHeaders): void {
        this.doConnect(headers).catch(this.sessionError);
    }

    send(headers: StompHeaders, body?: string): void {
        this.doSend(headers, body).catch(this.sessionError);
    }

    subscribe(headers: StompHeaders): void {
        this.doSubscribe(headers).catch(this.sessionError);
    }

    unsubscribe(headers: StompHeaders): void {
        this.doUnubscribe(headers).catch(this.sessionError);
    }

    begin(headers: StompHeaders): void {
        this.doBegin(headers).catch(this.sessionError);
    }

    commit(headers: StompHeaders): void {

    }

    abort(headers: StompHeaders): void {

    }

    ack(headers: StompHeaders): void {
        this.doAcknowledge(true, headers).catch(this.sessionError);
    }

    nack(headers: StompHeaders): void {
        this.doAcknowledge(false, headers).catch(this.sessionError);
    }

    disconnect(headers: StompHeaders): void {
        //TODO: handle receipt
    }

    onProtocolError(error: StompError): void {
    }

    onEnd(): void {
        this.broker.sessionEnd(this.sessionId);
        this.broker.listener.sessionEnd(this.sessionId);
        //TODO: cleanup subscriptions
    }

    private async doConnect(headers: StompHeaders) {
        try {
            await this.broker.listener.connecting(this.sessionId, headers);
            await this.session.connected({ version: this.session.protocolVersion, server: 'StompBroker/1.0.0' });  //TODO: configure broker name
        } catch (err) {
            log.debug("StompBrokerLayer: error while connecting session %s: %O", this.session.data.id, err);
            await this.sendErrorFrame(err);
        }
    }

    /**
     * Sends an ERROR frame.
     * @param  headers Stomp Headers
     * @param  err     Stomp Error
     */
    private async sendErrorFrame(err: StompError, headers?: StompHeaders) {
        headers = headers || {};
        headers.message = err.message;
        await this.session.error(headers, err.details);
    }

    private async doSend(headers: StompHeaders, body?: string) {
        try {
            await this.broker.listener.incomingMessage(this.sessionId, headers, body);
            await this.receiptCallback(headers);
        } catch (err) {
            await this.receiptCallback(headers, err);
        }
    }

    /**
     * Sends a RECEIPT frame, if the request headers contain a receipt ID.
     * @param  headers Stomp Headers that may contain a receipt ID
     * @param  err     Stomp Error object created by user
     */
    private async receiptCallback(headers: StompHeaders, err?: StompError) {
        const receipt = typeof headers.receipt === 'string' ? headers.receipt : undefined;
        if (err) {
            await this.sendErrorFrame(err, receipt ? { 'receipt-id': receipt } : undefined);
        } else if (receipt) {
            await this.session.receipt({ 'receipt-id': receipt });
        }
    }

    private async doSubscribe(headers: StompHeaders) {
        if (this.session.protocolVersion == StompProtocolHandlerV10.version && !headers.id) {
            // version 1.0 does not require subscription id header, we must generate it.
            headers.id = 'sub_' + this.nextSubscriptionId();
        }
        const subscription: Subscription = Object.seal({
            id: headers.id,
            destination: headers.destination,
            ack: headers.ack || 'auto'
        });
        try {
            this.broker.subscriptions.add(this.sessionId, subscription);
            try {
                await this.broker.listener.subscribing(this.sessionId, subscription);
            } catch (err) {
                this.broker.subscriptions.remove(this.sessionId, subscription.id);
                throw err;
            }
            await this.receiptCallback(headers);
        } catch (err) {
            await this.receiptCallback(headers, err);
        }
    }

    private async doUnubscribe(headers: StompHeaders) {
        let subscription: Subscription | undefined;
        if (headers.id) {
            subscription = this.broker.subscriptions.get(this.sessionId, headers.id)!;
        } else {
            // Fallback for version 1.0: get the first available subscription for the given destination.
            this.broker.subscriptions.forSessionDestination(this.sessionId, headers.destination, (sub) => {
                subscription = sub;
                return false;
            });
        }
        try {
            if (!subscription) {
                log.debug("StompBrokerLayer: error while unsubscribing, cannot find subscription for session %s: %O", this.sessionId, headers);
                throw new StompError("Cannot unsubscribe: unknown subscription ID or destination.");
            }
            await this.broker.listener.unsubscribing(this.sessionId, subscription);
            this.broker.subscriptions.remove(this.sessionId, subscription.id);
            await this.receiptCallback(headers);
        } catch (err) {
            await this.receiptCallback(headers, err);
        }
    }

    private async doAcknowledge(value: boolean, headers: StompHeaders) {
        const ack: Acknowledge = {
            value,
            messageId: headers.id || headers.messageId
        }
        if (headers.transaction) {
            ack.transaction = headers.transaction;
        }
        if (headers.subscription) {
            ack.subscription = headers.subscription;
        }
        try {
            await this.broker.listener.acknowledging(this.sessionId, ack);
            await this.receiptCallback(headers);
        } catch (err) {
            await this.receiptCallback(headers, err);
        }
    }

    private async doBegin(headers: StompHeaders) {
        try {
            const id = headers.transaction;
            if (this.transactions.has(id)) {
                throw new StompError(`Transaction with ID ${id} already started.`);
            }
            this.transactions.add(id);
            try {
                await this.broker.listener.beginningTransaction(this.sessionId, id);
            } catch (err) {
                this.transactions.delete(id);
                throw err;
            }
            await this.receiptCallback(headers);
        } catch (err) {
            await this.receiptCallback(headers, err);
        }
    }

}

export interface Acknowledge {
    value: boolean;
    messageId: string;
    subscription?: string;
    transaction?: string;
}

export interface Subscription {
    id: string,
    destination: string,
    ack: string
}


interface BrokerSession<S extends GenericSocket> {
    socket: S;
    stompSession: StompServerSessionLayer;
    // bindings: Map<string, SubscriptionBinding>; //this is an implementation-specific detail. maybe we need generic here?
}

// currently unused.

// interface Transaction<T> {
//     id: string;
//     data: T;
// }
//
// class SessionTransactionRegistry {
//
//     private readonly map = new Map<string, Transaction<any>>();
//
//     public add<T>(transaction: Transaction<T>) {
//         if (this.map.has(transaction.id)) {
//             throw new StompError(`Transaction ID ${transaction.id} already found.`);
//         }
//         this.map.set(transaction.id, transaction);
//     }
//
//     public get<T>(transactionId: string) {
//         return this.map.get(transactionId);
//     }
//
//     public remove(transactionId: string) {
//         return this.map.delete(transactionId);
//     }
//
// }


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

    public remove(sessionId: string): boolean;
    public remove(sessionId: string, subscriptionId: string): boolean;
    public remove(sessionId: string, subscriptionId?: string): boolean {
        const reg = this.bySessionId.get(sessionId);
        if (reg) {
            if (subscriptionId) { // remove just a single subscription for the given session
                this.removeFromDestinationMap(reg, subscriptionId);
                return reg.remove(subscriptionId);
            }
            // remove all subscriptions for the given session
            for (let dest of reg.destinations) {
                const arr = this.byDestination.get(dest)!;
                let i = arr.findIndex(s => s === reg);
                while (i >= 0) {
                    arr.splice(i, 1);
                    i = arr.findIndex(s => s === reg);
                }
            }
            this.bySessionId.delete(sessionId);
        }
        return !!reg;
    }

    private removeFromDestinationMap(reg: SessionSubscriptionsRegistry, subscriptionId: string) {
        const subscription = reg.get(subscriptionId);
        if (subscription) {
            const destination = subscription.destination;
            let i = 0; // counts how many subscription of this session to the given destination
            reg.forDestination(destination, (_subscription) => (i++ , true));
            if (i === 1) {  // last subscription of this session for the given destination
                const arr = this.byDestination.get(destination)!;
                arr.splice(arr.findIndex(s => s === reg), 1);
            }
        }
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

    public get destinations() {
        return this.byDestination.keys();
    }

    public add(subscription: Subscription) {
        if (this.byId.has(subscription.id)) {
            throw new StompError(`Subscription ID ${subscription.id} already found for session ${this.sessionId}.`);
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
