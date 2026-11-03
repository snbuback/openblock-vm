const Buffer = require('buffer').Buffer;

const Webrepl = require('../../io/webrepl');
const Base64Util = require('../../util/base64-util');

/**
 * Quote a JS string as a Python single-quoted string literal.
 * @param {string} text - text to quote.
 * @returns {string} - Python literal.
 */
const pyStr = text => `'${String(text)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")}'`;

/**
 * Manage a MicroPython peripheral over WebREPL.
 *
 * This is the WebREPL equivalent of CommonPeripheral: it exposes the same
 * upload/console surface and additionally implements the live (realtime)
 * operations used by the MicroPython block set. Live commands are executed
 * through the board's raw REPL by the link-side WebREPL session.
 */
class WebReplPeripheral {
    /**
     * @param {Runtime} runtime - the OpenBlock runtime.
     * @param {string} deviceId - the id of the peripheral.
     * @param {string} originalDeviceId - original device id.
     * @param {object} deviceOpt - uploader configuration.
     * @param {object} options - construction options.
     * @param {boolean} options.register - register this instance in the runtime.
     */
    constructor (runtime, deviceId, originalDeviceId, deviceOpt, options = {}) {
        this._runtime = runtime;
        this._deviceId = deviceId;
        this._originalDeviceId = originalDeviceId;
        this.diveceOpt = deviceOpt;

        this._webrepl = null;
        this._liveObjects = new Set();
        this._livePins = {};
        this._prologueDone = false;
        this._prologuePromise = null;

        this.reset = this.reset.bind(this);
        this._onConnect = this._onConnect.bind(this);
        this._onMessage = this._onMessage.bind(this);

        if (options.register !== false) {
            this._runtime.registerPeripheralExtension(deviceId, this);
        }

        this._createSocket();
    }

    /**
     * Create the Link WebREPL socket.
     * @private
     */
    _createSocket () {
        if (this._webrepl) {
            this._webrepl.disconnect();
        }
        this._webrepl = new Webrepl(this._runtime, this._originalDeviceId, {
            filters: {pnpid: []}
        }, this._onConnect, this.reset);
    }

    /**
     * Called by the runtime when the user wants to scan. WebREPL is manual.
     */
    scan () {
        this._createSocket();
    }

    /**
     * Connect to the given "host:port".
     * @param {string} id - host:port.
     * @param {number} _baudrate - ignored (WebREPL has no serial line).
     * @param {object} config - {host, port, password}.
     */
    connect (id, _baudrate, config = null) {
        if (!this._webrepl || !this._webrepl.isSocketOpen()) {
            // The Link session may have been closed by a cancelled attempt.
            this._createSocket();
        }
        if (this._webrepl) {
            // connectPeripheral queues until the new socket has opened.
            this._webrepl.connectPeripheral(id, config || {});
        }
    }

    /**
     * Disconnect from the peripheral.
     */
    disconnect () {
        if (this._webrepl) {
            this._webrepl.disconnect();
        }
        this.reset();
    }

    /**
     * Reset live state.
     */
    reset () {
        this._liveObjects.clear();
        this._livePins = {};
        this._prologueDone = false;
        this._prologuePromise = null;
    }

    /**
     * @returns {boolean} - whether the peripheral is connected.
     */
    isConnected () {
        return this._webrepl ? this._webrepl.isConnected() : false;
    }

    /**
     * WebREPL has no baudrate.
     */
    setBaudrate () {
    }

    /**
     * Upload code as main.py.
     * @param {string} code - MicroPython source.
     */
    upload (code) {
        if (!this._webrepl) return;
        // The board is reset after the upload, so board-side objects from a
        // previous realtime session no longer exist.
        this.reset();
        const base64Str = Buffer.from(code).toString('base64');
        this._webrepl.upload(base64Str, this.diveceOpt, 'base64');
    }

    /**
     * Firmware flashing is not supported over WebREPL.
     */
    uploadFirmware () {
        if (this._webrepl) {
            this._webrepl.uploadFirmware(this.diveceOpt);
        }
    }

    /**
     * Abort an upload.
     */
    abortUpload () {
        if (this._webrepl) {
            this._webrepl.abortUpload();
        }
    }

    /**
     * Write console text.
     * @param {string} data - text to write.
     */
    write (data) {
        if (!this.isConnected()) return;
        this._webrepl.write(Buffer.from(data).toString('base64'), 'base64');
    }

    /**
     * Write bytes to the REPL.
     * @param {Uint8Array} message - message.
     */
    send (message) {
        if (!this.isConnected()) return;
        this._webrepl.write(Base64Util.uint8ArrayToBase64(message), 'base64');
    }

    /**
     * Called after the Link session connected.
     * @private
     */
    _onConnect () {
        this._webrepl.read(this._onMessage);
    }

    /**
     * Forward REPL output to the hardware console.
     * @param {string} base64 - incoming data.
     * @private
     */
    _onMessage (base64) {
        const consoleData = Buffer.from(base64, 'base64');
        this._runtime.emit(this._runtime.constructor.PERIPHERAL_RECIVE_DATA, consoleData);
    }

    /**
     * Whether live commands can run right now.
     * @returns {boolean} - true when connected.
     */
    isReady () {
        return this.isConnected();
    }

    /**
     * Execute one Python statement on the board.
     * @param {string} command - Python source.
     * @param {number} timeout - timeout in ms.
     * @param {object} options - execution options.
     * @returns {Promise<string>} - stdout.
     */
    async execLive (command, timeout, options) {
        if (!this.isConnected()) {
            throw new Error('No peripheral is connected.');
        }
        await this._ensurePrologue();
        return this._webrepl.execLive(command, timeout, options);
    }

    /**
     * Import the modules used by most realtime blocks once per connection.
     * @returns {Promise} - resolved when the imports are available.
     * @private
     */
    _ensurePrologue () {
        if (this._prologueDone) return Promise.resolve();
        if (!this._prologuePromise) {
            this._prologuePromise = this._webrepl.execLive(
                'from machine import Pin, PWM, ADC\nimport time\n'
            ).then(() => {
                this._prologueDone = true;
            })
                .catch(err => {
                    this._prologueDone = false;
                    throw err;
                })
                .then(result => {
                    this._prologuePromise = null;
                    return result;
                }, err => {
                    this._prologuePromise = null;
                    throw err;
                });
        }
        return this._prologuePromise;
    }

    /**
     * Create a board-side object once.
     * @param {string} key - cache key.
     * @param {string} initCode - Python source creating it.
     * @returns {Promise} - resolved when present.
     */
    async ensureLiveObject (key, initCode) {
        if (this._liveObjects.has(key)) return;
        if (initCode) {
            await this.execLive(initCode);
        }
        this._liveObjects.add(key);
    }

    /**
     * @param {string} key - cache key.
     * @returns {boolean} - whether the object was created.
     */
    hasLiveObject (key) {
        return this._liveObjects.has(key);
    }

    /**
     * Read a Python expression as a string.
     * @param {string} expression - expression.
     * @returns {Promise<string>} - its value.
     */
    async readLiveString (expression) {
        try {
            const output = await this.execLive(`print(${expression})`);
            return String(output === null ? '' : output).trim();
        } catch (err) {
            return '';
        }
    }

    /**
     * Read a Python expression as a number.
     * @param {string} expression - expression.
     * @returns {Promise<number>} - its value.
     */
    async readLiveNumber (expression) {
        const value = Number(await this.readLiveString(expression));
        return isNaN(value) ? 0 : value;
    }

    /**
     * Ensure a Pin object exists.
     * @param {string} pin - pin number.
     * @returns {string} - variable name.
     * @private
     */
    _pinVar (pin) {
        return `p${pin}`;
    }

    async setPinMode (pin, mode) {
        const args = {
            INPUT: 'Pin.IN',
            OUTPUT: 'Pin.OUT',
            INPUT_PULLUP: 'Pin.IN, Pin.PULL_UP',
            INPUT_PULLDOWN: 'Pin.IN, Pin.PULL_DOWN'
        }[mode] || 'Pin.IN';
        await this.ensureLiveObject(`pin_${pin}`,
            `from machine import Pin\n${this._pinVar(pin)} = Pin(${pin})`);
        this._livePins[pin] = mode;
        return this.execLive(`${this._pinVar(pin)}.init(${args})`);
    }

    async setDigitalOutput (pin, level) {
        const value = String(level) === '1' ? 1 : 0;
        await this.ensureLiveObject(`pin_${pin}`,
            `from machine import Pin\n${this._pinVar(pin)} = Pin(${pin})`);
        this._livePins[pin] = 'OUTPUT';
        return this.execLive(
            `${this._pinVar(pin)}.init(Pin.OUT)\n${this._pinVar(pin)}.value(${value})`);
    }

    async setPwmOutput (pin, out) {
        const name = `pwm${pin}`;
        await this.ensureLiveObject(`pwm_${pin}`,
            `from machine import Pin, PWM\n${name} = PWM(Pin(${pin}), freq=1000, duty=0)`);
        return this.execLive(`${name}.duty(${Math.max(0, Math.min(1023, Number(out) || 0))})`);
    }

    async setDACOutput (pin, out) {
        const name = `dac${pin}`;
        await this.ensureLiveObject(`dac_${pin}`,
            `from machine import Pin, DAC\n${name} = DAC(Pin(${pin}))`);
        return this.execLive(`${name}.write(${Math.max(0, Math.min(255, Number(out) || 0))})`);
    }

    async readDigitalPin (pin) {
        await this.ensureLiveObject(`pin_${pin}`,
            `from machine import Pin\n${this._pinVar(pin)} = Pin(${pin})`);
        if (!this._livePins[pin]) {
            await this.execLive(`${this._pinVar(pin)}.init(Pin.IN)`);
            this._livePins[pin] = 'INPUT';
        }
        const value = await this.readLiveString(`${this._pinVar(pin)}.value()`);
        return value === '1' || value === 'True';
    }

    async readAnalogPin (pin) {
        const name = `adc${pin}`;
        await this.ensureLiveObject(`adc_${pin}`,
            `from machine import Pin, ADC\n${name} = ADC(Pin(${pin}))\n${name}.atten(ADC.ATTN_11DB)`);
        return this.readLiveNumber(`${name}.read()`);
    }

    async readTouchPin (pin) {
        const name = `tp${pin}`;
        await this.ensureLiveObject(`tp_${pin}`,
            `from machine import Pin, TouchPad\n${name} = TouchPad(Pin(${pin}))`);
        return this.readLiveNumber(`${name}.read()`);
    }

    async setServoOutput (pin, out) {
        const name = `servo${pin}`;
        await this.ensureLiveObject(`servo_${pin}`,
            `from machine import Pin, PWM\n${name} = PWM(Pin(${pin}), freq=50)`);
        const angle = Math.max(0, Math.min(180, Number(out) || 0));
        const duty = Math.round(25.6 + ((angle * 102.4) / 180));
        return this.execLive(`${name}.duty(${duty})`);
    }

    async releaseServo (pin) {
        if (!this.hasLiveObject(`servo_${pin}`)) return;
        await this.execLive(`servo${pin}.deinit()`);
        this._liveObjects.delete(`servo_${pin}`);
    }

    /**
     * Print text from a realtime block.
     * @param {string} text - text to print.
     * @param {string} eol - 'warp' or 'noWarp'.
     * @returns {Promise} - resolved when printed.
     */
    async consolePrint (text, eol) {
        const end = eol === 'noWarp' ? "', end=''" : '';
        return this.execLive(`print(${pyStr(text)}${end})`, 10000, {echo: true});
    }

    /**
     * Setting a BLE name is meaningless on the WebREPL transport.
     * @returns {Promise} - resolved immediately.
     */
    setBleDeviceName () {
        return Promise.resolve();
    }
}

WebReplPeripheral.pyStr = pyStr;

module.exports = WebReplPeripheral;
