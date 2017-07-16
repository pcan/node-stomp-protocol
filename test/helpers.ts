
export function check(f: Function, done: Function) {
    try {
        f();
        done();
    } catch (e) {
        done(e);
    }
}


export function countdownLatch(count: number, done: Function) {
    return () => {
        if(--count <= 0) {
            done();
        }
    };
}
