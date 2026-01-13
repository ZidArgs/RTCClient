export default class EventTargetManager {

    #normalSubscriberList = new Map();

    #captureSubscriberList = new Map();

    #passiveSubscriberList = new Map();

    #capturePassiveSubscriberList = new Map();

    #target;

    #active;

    constructor(target = null, active = true) {
        if (target != null && !(target instanceof EventTarget)) {
            throw new TypeError("target must be an instance of EventTarget or null");
        }
        this.#setTarget(target);
        this.#active = !!active;
    }

    set active(value) {
        value = !!value;
        if (this.#active != value) {
            this.#active = value;
            if (value) {
                this.#addEventListeners();
            } else {
                this.#removeEventListeners();
            }
        }
    }

    get active() {
        return this.#active;
    }

    switchTarget(target) {
        if (target != null && !(target instanceof EventTarget)) {
            throw new TypeError("target must be an instance of EventTarget or null");
        }
        this.#removeEventListeners();
        this.#setTarget(target);
        if (this.#active) {
            this.#addEventListeners();
        }
    }

    #setTarget(target) {
        if (target != null) {
            this.#target = new WeakRef(target);
        } else {
            this.#target = null;
        }
    }

    get target() {
        return this.#target?.deref();
    }

    set(name, handler, options) {
        if (typeof handler != "function") {
            throw new TypeError(`handler parameter must be of type "function" but was "${typeof handler}"`);
        }
        if (Array.isArray(name)) {
            for (const n of name) {
                this.set(n, handler, options);
            }
        } else {
            if (typeof name != "string") {
                throw new TypeError(`name parameter must be of type "string" but was "${typeof name}"`);
            }
            const {
                capture = false, passive = false
            } = options ?? {};
            const subscriberList = this.#getSubscriberList(capture, passive);
            const target = this.#target?.deref();
            if (this.#active && target != null) {
                if (subscriberList.has(name)) {
                    const oldhandler = subscriberList.get(name);
                    target.removeEventListener(name, oldhandler, {
                        capture,
                        passive
                    });
                }
                target.addEventListener(name, handler, {
                    capture,
                    passive
                });
            }
            subscriberList.set(name, handler);
        }
    }

    delete(name, options) {
        if (Array.isArray(name)) {
            for (const n of name) {
                this.delete(n, options);
            }
        } else {
            if (typeof name != "string") {
                throw new TypeError(`name parameter must be of type "string" but was "${typeof name}"`);
            }
            const {
                capture = false, passive = false
            } = options ?? {};
            const subscriberList = this.#getSubscriberList(capture, passive);
            const target = this.#target?.deref();
            if (target != null) {
                if (subscriberList.has(name)) {
                    const oldhandler = subscriberList.get(name);
                    target.removeEventListener(name, oldhandler, {
                        capture,
                        passive
                    });
                }
            }
            subscriberList.delete(name);
        }
    }

    clear() {
        this.#removeEventListeners();
        this.#normalSubscriberList.clear();
        this.#captureSubscriberList.clear();
        this.#passiveSubscriberList.clear();
        this.#capturePassiveSubscriberList.clear();
    }

    #getSubscriberList(capture, passive) {
        if (capture) {
            if (passive) {
                return this.#capturePassiveSubscriberList;
            }
            return this.#captureSubscriberList;
        }
        if (passive) {
            return this.#passiveSubscriberList;
        }
        return this.#normalSubscriberList;
    }

    #addEventListeners() {
        const target = this.#target?.deref();
        if (target != null) {
            for (const [name, handler] of this.#normalSubscriberList) {
                target.addEventListener(name, handler);
            }
            for (const [name, handler] of this.#captureSubscriberList) {
                target.addEventListener(name, handler, {capture: true});
            }
            for (const [name, handler] of this.#passiveSubscriberList) {
                target.addEventListener(name, handler, {passive: true});
            }
            for (const [name, handler] of this.#capturePassiveSubscriberList) {
                target.addEventListener(name, handler, {
                    capture: true,
                    passive: true
                });
            }
        }
    }

    #removeEventListeners() {
        const target = this.#target?.deref();
        if (target != null) {
            for (const [name, handler] of this.#normalSubscriberList) {
                target.removeEventListener(name, handler);
            }
            for (const [name, handler] of this.#captureSubscriberList) {
                target.removeEventListener(name, handler, {capture: true});
            }
            for (const [name, handler] of this.#passiveSubscriberList) {
                target.removeEventListener(name, handler, {passive: true});
            }
            for (const [name, handler] of this.#capturePassiveSubscriberList) {
                target.removeEventListener(name, handler, {
                    capture: true,
                    passive: true
                });
            }
        }
    }

}
