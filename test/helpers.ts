
export function check(f: Function, done: Function) {
    try {
        f();
        done();
    } catch (e) {
        done(e);
    }
}


export function countdownLatch(count: number, done: Function) {
    return (e?: any) => {
        if(e instanceof Error) {
            done(e);
        } else if(--count <= 0) {
            done();
        }
    };
}


export const noopFn = () => {};

export const noopAsyncFn = async () => {};
