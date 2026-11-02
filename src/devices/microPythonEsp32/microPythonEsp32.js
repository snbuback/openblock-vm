const formatMessage = require('format-message');

const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');

const WebReplPeripheral = require('../common/webrepl-peripheral');

/**
 * Uploader options. WebREPL only needs the loader type; no serial or
 * browser-side firmware flashing is involved on this transport.
 * @readonly
 */
const DIVECE_OPT = {
    type: 'microPython'
};

const Pins = {
    IO0: '0',
    IO1: '1',
    IO2: '2',
    IO3: '3',
    IO4: '4',
    IO5: '5',
    IO12: '12',
    IO13: '13',
    IO14: '14',
    IO15: '15',
    IO16: '16',
    IO17: '17',
    IO18: '18',
    IO19: '19',
    IO21: '21',
    IO22: '22',
    IO23: '23',
    IO25: '25',
    IO26: '26',
    IO27: '27',
    IO32: '32',
    IO33: '33',
    IO34: '34',
    IO35: '35',
    IO36: '36',
    IO39: '39'
};

const Level = {
    High: '1',
    Low: '0'
};

const Eol = {
    Warp: 'warp',
    NoWarp: 'noWarp'
};

const Mode = {
    Input: 'INPUT',
    Output: 'OUTPUT',
    InputPullup: 'INPUT_PULLUP',
    InputPulldown: 'INPUT_PULLDOWN'
};

const DhtType = {
    DHT11: 'DHT11',
    DHT22: 'DHT22'
};

const DhtData = {
    Temperature: 'temperature',
    Humidity: 'humidity'
};

/**
 * Quote a JS string as a python single-quoted string literal.
 * @param {string} text - the text to quote.
 * @return {string} - the python literal.
 */
const pyStr = text => `'${String(text)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")}'`;

/**
 * Python helper function measuring a HC-SR04 style ultrasonic sensor,
 * shared by the upload code generator and the realtime mode (keep in sync
 * with hxblock-blocks generators/python/esp32.js). time_pulse_us returns -2
 * when the echo pulse never starts (sensor missing, miswired or unpowered)
 * and -1 when it outlasts the timeout (nothing in range): report -1 and the
 * 400 cm rated range respectively. The pull-down keeps a disconnected ECHO
 * line from floating into random readings.
 * @readonly
 */
const SR04_FUNC =
    'def _ob_sr04(trig, echo):\n' +
    '    import machine\n' +
    '    tp = Pin(trig, Pin.OUT)\n' +
    '    ep = Pin(echo, Pin.IN, Pin.PULL_DOWN)\n' +
    '    tp.value(0)\n' +
    '    time.sleep_us(2)\n' +
    '    tp.value(1)\n' +
    '    time.sleep_us(10)\n' +
    '    tp.value(0)\n' +
    '    d = machine.time_pulse_us(ep, 1, 30000)\n' +
    '    if d == -2:\n' +
    '        return -1\n' +
    '    if d < 0:\n' +
    '        return 400\n' +
    '    return min(400, round(d / 58.0, 1))\n';

/**
 * OpenBlock blocks to interact with a MicroPython esp32 peripheral.
 */
class OpenBlockMicroPythonEsp32Device {
    /**
     * @return {string} - the ID of this extension.
     */
    get DEVICE_ID () {
        return 'microPythonEsp32';
    }

    /**
     * Whether the chip has DAC pins (classic ESP32 only).
     * @return {boolean} - true when DAC blocks should be shown.
     */
    get HAS_DAC () {
        return true;
    }

    /**
     * Whether the chip has capacitive touch pins.
     * @return {boolean} - true when touch blocks should be shown.
     */
    get HAS_TOUCH () {
        return true;
    }

    /**
     * @return {string} - default trig pin of the ultrasonic block.
     */
    get DEFAULT_TRIG_PIN () {
        return Pins.IO5;
    }

    /**
     * @return {string} - default echo pin of the ultrasonic block.
     */
    get DEFAULT_ECHO_PIN () {
        return Pins.IO18;
    }

    /**
     * @return {object} - uploader options for this chip.
     */
    get DIVECE_OPT () {
        return DIVECE_OPT;
    }

    get PINS_MENU () {
        return [
            {
                text: 'IO0',
                value: Pins.IO0
            },
            {
                text: 'IO1',
                value: Pins.IO1
            },
            {
                text: 'IO2',
                value: Pins.IO2
            },
            {
                text: 'IO3',
                value: Pins.IO3
            },
            {
                text: 'IO4',
                value: Pins.IO4
            },
            {
                text: 'IO5',
                value: Pins.IO5
            },
            // Pins 6 to 11 are used by the ESP32 Flash, not recommended for general use.
            {
                text: 'IO12',
                value: Pins.IO12
            },
            {
                text: 'IO13',
                value: Pins.IO13
            },
            {
                text: 'IO14',
                value: Pins.IO14
            },
            {
                text: 'IO15',
                value: Pins.IO15
            },
            {
                text: 'IO16',
                value: Pins.IO16
            },
            {
                text: 'IO17',
                value: Pins.IO17
            },
            {
                text: 'IO18',
                value: Pins.IO18
            },
            {
                text: 'IO19',
                value: Pins.IO19
            },
            {
                text: 'IO21',
                value: Pins.IO21
            },
            {
                text: 'IO22',
                value: Pins.IO22
            },
            {
                text: 'IO23',
                value: Pins.IO23
            },
            {
                text: 'IO25',
                value: Pins.IO25
            },
            {
                text: 'IO26',
                value: Pins.IO26
            },
            {
                text: 'IO27',
                value: Pins.IO27
            },
            {
                text: 'IO32',
                value: Pins.IO32
            },
            {
                text: 'IO33',
                value: Pins.IO33
            },
            {
                text: 'IO34',
                value: Pins.IO34
            },
            {
                text: 'IO35',
                value: Pins.IO35
            },
            {
                text: 'IO36',
                value: Pins.IO36
            },
            {
                text: 'IO39',
                value: Pins.IO39
            }
        ];
    }

    get OUT_PINS_MENU () {
        return [
            {
                text: 'IO0',
                value: Pins.IO0
            },
            {
                text: 'IO1',
                value: Pins.IO1
            },
            {
                text: 'IO2',
                value: Pins.IO2
            },
            {
                text: 'IO3',
                value: Pins.IO3
            },
            {
                text: 'IO4',
                value: Pins.IO4
            },
            {
                text: 'IO5',
                value: Pins.IO5
            },
            {
                text: 'IO12',
                value: Pins.IO12
            },
            {
                text: 'IO13',
                value: Pins.IO13
            },
            {
                text: 'IO14',
                value: Pins.IO14
            },
            {
                text: 'IO15',
                value: Pins.IO15
            },
            {
                text: 'IO16',
                value: Pins.IO16
            },
            {
                text: 'IO17',
                value: Pins.IO17
            },
            {
                text: 'IO18',
                value: Pins.IO18
            },
            {
                text: 'IO19',
                value: Pins.IO19
            },
            {
                text: 'IO21',
                value: Pins.IO21
            },
            {
                text: 'IO22',
                value: Pins.IO22
            },
            {
                text: 'IO23',
                value: Pins.IO23
            },
            {
                text: 'IO25',
                value: Pins.IO25
            },
            {
                text: 'IO26',
                value: Pins.IO26
            },
            {
                text: 'IO27',
                value: Pins.IO27
            },
            {
                text: 'IO32',
                value: Pins.IO32
            },
            {
                text: 'IO33',
                value: Pins.IO33
            }
        ];
    }

    get MODE_MENU () {
        return [
            {
                text: formatMessage({
                    id: 'microPythonEsp32.modeMenu.input',
                    default: 'input',
                    description: 'label for input pin mode'
                }),
                value: Mode.Input
            },
            {
                text: formatMessage({
                    id: 'microPythonEsp32.modeMenu.output',
                    default: 'output',
                    description: 'label for output pin mode'
                }),
                value: Mode.Output
            },
            {
                text: formatMessage({
                    id: 'microPythonEsp32.modeMenu.inputPullup',
                    default: 'input-pullup',
                    description: 'label for input-pullup pin mode'
                }),
                value: Mode.InputPullup
            },
            {
                text: formatMessage({
                    id: 'microPythonEsp32.modeMenu.inputPulldown',
                    default: 'input-pulldown',
                    description: 'label for input-pulldown pin mode'
                }),
                value: Mode.InputPulldown
            }
        ];
    }

    get ANALOG_PINS_MENU () {
        return [
            {
                text: 'IO0',
                value: Pins.IO0
            },
            {
                text: 'IO2',
                value: Pins.IO2
            },
            {
                text: 'IO4',
                value: Pins.IO4
            },
            {
                text: 'IO12',
                value: Pins.IO12
            },
            {
                text: 'IO13',
                value: Pins.IO13
            },
            {
                text: 'IO14',
                value: Pins.IO14
            },
            {
                text: 'IO15',
                value: Pins.IO15
            },
            {
                text: 'IO25',
                value: Pins.IO25
            },
            {
                text: 'IO26',
                value: Pins.IO26
            },
            {
                text: 'IO27',
                value: Pins.IO27
            },
            {
                text: 'IO32',
                value: Pins.IO32
            },
            {
                text: 'IO33',
                value: Pins.IO33
            },
            {
                text: 'IO34',
                value: Pins.IO34
            },
            {
                text: 'IO35',
                value: Pins.IO35
            },
            {
                text: 'IO36',
                value: Pins.IO36
            },
            {
                text: 'IO39',
                value: Pins.IO39
            }
        ];
    }

    get DAC_PINS_MENU () {
        return [
            {
                text: 'IO25',
                value: Pins.IO25
            },
            {
                text: 'IO26',
                value: Pins.IO26
            }
        ];
    }

    get TOUCH_PINS_MENU () {
        return [
            {
                text: 'IO0',
                value: Pins.IO0
            },
            {
                text: 'IO2',
                value: Pins.IO2
            },
            {
                text: 'IO4',
                value: Pins.IO4
            },
            {
                text: 'IO12',
                value: Pins.IO12
            },
            {
                text: 'IO13',
                value: Pins.IO13
            },
            {
                text: 'IO14',
                value: Pins.IO14
            },
            {
                text: 'IO15',
                value: Pins.IO15
            },
            {
                text: 'IO27',
                value: Pins.IO27
            },
            {
                text: 'IO32',
                value: Pins.IO32
            },
            {
                text: 'IO33',
                value: Pins.IO33
            }
        ];
    }

    get LEVEL_MENU () {
        return [
            {
                text: formatMessage({
                    id: 'microPythonEsp32.levelMenu.high',
                    default: 'high',
                    description: 'label for high level'
                }),
                value: Level.High
            },
            {
                text: formatMessage({
                    id: 'microPythonEsp32.levelMenu.low',
                    default: 'low',
                    description: 'label for low level'
                }),
                value: Level.Low
            }
        ];
    }

    get EOL_MENU () {
        return [
            {
                text: formatMessage({
                    id: 'microPythonEsp32.eolMenu.warp',
                    default: 'warp',
                    description: 'label for warp print'
                }),
                value: Eol.Warp
            },
            {
                text: formatMessage({
                    id: 'microPythonEsp32.eolMenu.noWarp',
                    default: 'no-warp',
                    description: 'label for no warp print'
                }),
                value: Eol.NoWarp
            }
        ];
    }

    get DHT_TYPE_MENU () {
        return [
            {
                text: 'DHT11',
                value: DhtType.DHT11
            },
            {
                text: 'DHT22',
                value: DhtType.DHT22
            }
        ];
    }

    get DHT_DATA_MENU () {
        return [
            {
                text: formatMessage({
                    id: 'microPythonEsp32.dhtDataMenu.temperature',
                    default: 'temperature(℃)',
                    description: 'label for dht temperature'
                }),
                value: DhtData.Temperature
            },
            {
                text: formatMessage({
                    id: 'microPythonEsp32.dhtDataMenu.humidity',
                    default: 'humidity(%)',
                    description: 'label for dht humidity'
                }),
                value: DhtData.Humidity
            }
        ];
    }

    /**
     * Construct a set of MicroPython esp32 blocks.
     * @param {Runtime} runtime - the OpenBlock runtime.
     * @param {string} originalDeviceId - the original id of the peripheral, like xxx_microPythonEsp32
     */
    constructor (runtime, originalDeviceId) {
        /**
         * The OpenBlock runtime.
         * @type {Runtime}
         */
        this.runtime = runtime;

        // The board is reached over WiFi through the WebREPL transport.
        this._peripheral = new WebReplPeripheral(
            this.runtime,
            this.DEVICE_ID,
            originalDeviceId,
            this.DIVECE_OPT
        );
    }

    /**
     * @returns {Array.<object>} metadata for this extension and its blocks.
     */
    getInfo () {
        const info = this._buildInfo();
        const pinCategory = info.find(category => category.id === 'pin');
        if (!this.HAS_DAC) {
            pinCategory.blocks = pinCategory.blocks.filter(
                block => !block.opcode || block.opcode !== 'esp32SetDACOutput');
            delete pinCategory.menus.dacPins;
        }
        if (!this.HAS_TOUCH) {
            pinCategory.blocks = pinCategory.blocks.filter(
                block => !block.opcode || block.opcode !== 'esp32ReadTouchPin');
            delete pinCategory.menus.touchPins;
        }
        return info;
    }

    /**
     * @returns {Array.<object>} raw metadata for this extension, before
     * chip-specific filtering.
     * @private
     */
    _buildInfo () {
        return [
            {
                id: 'pin',
                name: formatMessage({
                    id: 'microPythonEsp32.category.pins',
                    default: 'Pins',
                    description: 'The name of the esp32 micropython device pin category'
                }),
                color1: '#4C97FF',
                color2: '#3373CC',
                color3: '#3373CC',

                blocks: [
                    {
                        opcode: 'esp32SetPinMode',
                        text: formatMessage({
                            id: 'microPythonEsp32.pins.esp32SetPinMode',
                            default: 'set pin [PIN] mode [MODE]',
                            description: 'microPythonEsp32 set pin mode'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'pins',
                                defaultValue: Pins.IO4
                            },
                            MODE: {
                                type: ArgumentType.STRING,
                                menu: 'mode',
                                defaultValue: Mode.Input
                            }
                        }
                    },
                    {
                        opcode: 'esp32SetDigitalOutput',
                        text: formatMessage({
                            id: 'microPythonEsp32.pins.esp32SetDigitalOutput',
                            default: 'set digital pin [PIN] out [LEVEL]',
                            description: 'microPythonEsp32 set digital pin out'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'outPins',
                                defaultValue: Pins.IO4
                            },
                            LEVEL: {
                                type: ArgumentType.STRING,
                                menu: 'level',
                                defaultValue: Level.High
                            }
                        }
                    },
                    {
                        opcode: 'esp32SetPwmOutput',
                        text: formatMessage({
                            id: 'microPythonEsp32.pins.esp32SetPwmOutput',
                            default: 'set pwm pin [PIN] out [OUT]',
                            description: 'microPythonEsp32 set pwm pin out'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'outPins',
                                defaultValue: Pins.IO4
                            },
                            OUT: {
                                type: ArgumentType.UINT10_NUMBER,
                                defaultValue: '0'
                            }
                        }
                    },
                    {
                        opcode: 'esp32SetDACOutput',
                        text: formatMessage({
                            id: 'microPythonEsp32.pins.esp32SetDACOutput',
                            default: 'set dac pin [PIN] out [OUT]',
                            description: 'microPythonEsp32 set dac pin out'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'dacPins',
                                defaultValue: Pins.IO25
                            },
                            OUT: {
                                type: ArgumentType.UINT8_NUMBER,
                                defaultValue: '0'
                            }
                        }
                    },
                    '---',
                    {
                        opcode: 'esp32ReadDigitalPin',
                        text: formatMessage({
                            id: 'microPythonEsp32.pins.esp32ReadDigitalPin',
                            default: 'read digital pin [PIN]',
                            description: 'microPythonEsp32 read digital pin'
                        }),
                        blockType: BlockType.BOOLEAN,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'pins',
                                defaultValue: Pins.IO4
                            }
                        }
                    },
                    {
                        opcode: 'esp32ReadAnalogPin',
                        text: formatMessage({
                            id: 'microPythonEsp32.pins.esp32ReadAnalogPin',
                            default: 'read analog pin [PIN]',
                            description: 'microPythonEsp32 read analog pin'
                        }),
                        blockType: BlockType.REPORTER,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'analogPins',
                                defaultValue: Pins.IO4
                            }
                        }
                    },
                    {
                        opcode: 'esp32ReadTouchPin',
                        text: formatMessage({
                            id: 'microPythonEsp32.pins.esp32ReadTouchPin',
                            default: 'read touch pin [PIN]',
                            description: 'microPythonEsp32 read touch pin'
                        }),
                        blockType: BlockType.REPORTER,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'touchPins',
                                defaultValue: Pins.IO4
                            }
                        }
                    },
                    '---',
                    {
                        opcode: 'setServoOutput',
                        text: formatMessage({
                            id: 'microPythonEsp32.pins.setServoOutput',
                            default: 'set servo pin [PIN] out [OUT]',
                            description: 'microPythonEsp32 set servo pin out'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'outPins',
                                defaultValue: Pins.IO4
                            },
                            OUT: {
                                type: ArgumentType.HALF_ANGLE,
                                defaultValue: '90'
                            }
                        }
                    },
                    {
                        opcode: 'servoRelease',
                        text: formatMessage({
                            id: 'microPythonEsp32.pins.servoRelease',
                            default: 'release servo pin [PIN]',
                            description: 'microPythonEsp32 release servo pin'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'outPins',
                                defaultValue: Pins.IO4
                            }
                        }
                    },
                    {
                        opcode: 'esp32PlayTone',
                        text: formatMessage({
                            id: 'microPythonEsp32.pins.esp32PlayTone',
                            default: 'play tone pin [PIN] frequency [FREQ] Hz',
                            description: 'microPythonEsp32 play tone on buzzer pin'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'outPins',
                                defaultValue: Pins.IO4
                            },
                            FREQ: {
                                type: ArgumentType.WHOLE_NUMBER,
                                defaultValue: '440'
                            }
                        }
                    },
                    {
                        opcode: 'esp32StopTone',
                        text: formatMessage({
                            id: 'microPythonEsp32.pins.esp32StopTone',
                            default: 'stop tone pin [PIN]',
                            description: 'microPythonEsp32 stop tone on buzzer pin'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'outPins',
                                defaultValue: Pins.IO4
                            }
                        }
                    }
                ],
                menus: {
                    pins: {
                        items: this.PINS_MENU
                    },
                    outPins: {
                        items: this.OUT_PINS_MENU
                    },
                    mode: {
                        items: this.MODE_MENU
                    },
                    analogPins: {
                        items: this.ANALOG_PINS_MENU
                    },
                    dacPins: {
                        items: this.DAC_PINS_MENU
                    },
                    touchPins: {
                        items: this.TOUCH_PINS_MENU
                    },
                    level: {
                        acceptReporters: true,
                        items: this.LEVEL_MENU
                    }
                }
            },
            {
                id: 'console',
                name: formatMessage({
                    id: 'microPythonEsp32.category.console',
                    default: 'Console',
                    description: 'The name of the esp32 micropython device console category'
                }),
                color1: '#9966FF',
                color2: '#774DCB',
                color3: '#774DCB',

                blocks: [
                    {
                        opcode: 'consolePrint',
                        text: formatMessage({
                            id: 'microPythonEsp32.console.consolePrint',
                            default: 'print [TEXT] [EOL]',
                            description: 'microPythonEsp32 console print'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            TEXT: {
                                type: ArgumentType.STRING,
                                defaultValue: 'Hello OpenBlock'
                            },
                            EOL: {
                                type: ArgumentType.STRING,
                                menu: 'eol',
                                defaultValue: Eol.Warp
                            }
                        }
                    },
                    {
                        opcode: 'consoleInput',
                        text: formatMessage({
                            id: 'microPythonEsp32.console.consoleInput',
                            default: 'prompt [TEXT] and read input',
                            description: 'microPythonEsp32 console read input'
                        }),
                        blockType: BlockType.REPORTER,
                        arguments: {
                            TEXT: {
                                type: ArgumentType.STRING,
                                defaultValue: '?'
                            }
                        }
                    }
                ],
                menus: {
                    eol: {
                        items: this.EOL_MENU
                    }
                }
            },
            {
                id: 'neopixel',
                name: formatMessage({
                    id: 'microPythonEsp32.category.neopixel',
                    default: 'NeoPixel',
                    description: 'The name of the esp32 micropython device neopixel category'
                }),
                color1: '#CF63CF',
                color2: '#C94FC9',
                color3: '#BD42BD',

                blocks: [
                    {
                        opcode: 'neopixelInit',
                        text: formatMessage({
                            id: 'microPythonEsp32.neopixel.neopixelInit',
                            default: 'init NeoPixel strip pin [PIN] count [COUNT]',
                            description: 'microPythonEsp32 init neopixel strip'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'outPins',
                                defaultValue: Pins.IO4
                            },
                            COUNT: {
                                type: ArgumentType.WHOLE_NUMBER,
                                defaultValue: '8'
                            }
                        }
                    },
                    {
                        opcode: 'neopixelSetColor',
                        text: formatMessage({
                            id: 'microPythonEsp32.neopixel.neopixelSetColor',
                            default: 'set NeoPixel [INDEX] red [R] green [G] blue [B]',
                            description: 'microPythonEsp32 set neopixel color'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            INDEX: {
                                type: ArgumentType.WHOLE_NUMBER,
                                defaultValue: '0'
                            },
                            R: {
                                type: ArgumentType.UINT8_NUMBER,
                                defaultValue: '20'
                            },
                            G: {
                                type: ArgumentType.UINT8_NUMBER,
                                defaultValue: '0'
                            },
                            B: {
                                type: ArgumentType.UINT8_NUMBER,
                                defaultValue: '0'
                            }
                        }
                    },
                    {
                        opcode: 'neopixelFill',
                        text: formatMessage({
                            id: 'microPythonEsp32.neopixel.neopixelFill',
                            default: 'set all NeoPixels red [R] green [G] blue [B]',
                            description: 'microPythonEsp32 fill all neopixels with one color'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            R: {
                                type: ArgumentType.UINT8_NUMBER,
                                defaultValue: '20'
                            },
                            G: {
                                type: ArgumentType.UINT8_NUMBER,
                                defaultValue: '0'
                            },
                            B: {
                                type: ArgumentType.UINT8_NUMBER,
                                defaultValue: '0'
                            }
                        }
                    },
                    {
                        opcode: 'neopixelSetBrightness',
                        text: formatMessage({
                            id: 'microPythonEsp32.neopixel.neopixelSetBrightness',
                            default: 'set NeoPixel brightness [BRT]%',
                            description: 'microPythonEsp32 set neopixel brightness'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            BRT: {
                                type: ArgumentType.INTOTO100_NUMBER,
                                defaultValue: '30'
                            }
                        }
                    },
                    {
                        opcode: 'neopixelShow',
                        text: formatMessage({
                            id: 'microPythonEsp32.neopixel.neopixelShow',
                            default: 'refresh NeoPixel strip',
                            description: 'microPythonEsp32 refresh neopixel strip'
                        }),
                        blockType: BlockType.COMMAND
                    },
                    {
                        opcode: 'neopixelClear',
                        text: formatMessage({
                            id: 'microPythonEsp32.neopixel.neopixelClear',
                            default: 'turn off all NeoPixels',
                            description: 'microPythonEsp32 turn off all neopixels'
                        }),
                        blockType: BlockType.COMMAND
                    }
                ],
                menus: {
                    outPins: {
                        items: this.OUT_PINS_MENU
                    }
                }
            },
            {
                id: 'sensor',
                name: formatMessage({
                    id: 'microPythonEsp32.category.sensor',
                    default: 'Sensor',
                    description: 'The name of the esp32 micropython device sensor category'
                }),
                color1: '#4CBFE6',
                color2: '#2E8EB8',
                color3: '#2E8EB8',

                blocks: [
                    {
                        opcode: 'sensorDhtRead',
                        text: formatMessage({
                            id: 'microPythonEsp32.sensor.sensorDhtRead',
                            default: 'read [DHTTYPE] pin [PIN] [DHTDATA]',
                            description: 'microPythonEsp32 read dht sensor'
                        }),
                        blockType: BlockType.REPORTER,
                        arguments: {
                            DHTTYPE: {
                                type: ArgumentType.STRING,
                                menu: 'dhtType',
                                defaultValue: DhtType.DHT11
                            },
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'pins',
                                defaultValue: Pins.IO4
                            },
                            DHTDATA: {
                                type: ArgumentType.STRING,
                                menu: 'dhtData',
                                defaultValue: DhtData.Temperature
                            }
                        }
                    },
                    {
                        opcode: 'sensorDs18b20Read',
                        text: formatMessage({
                            id: 'microPythonEsp32.sensor.sensorDs18b20Read',
                            default: 'read DS18B20 pin [PIN] temperature(℃)',
                            description: 'microPythonEsp32 read ds18b20 temperature'
                        }),
                        blockType: BlockType.REPORTER,
                        // DS18B20 moved to the espDs18b20 extension; the block
                        // stays registered so old projects still load and run.
                        hideFromPalette: true,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'pins',
                                defaultValue: Pins.IO4
                            }
                        }
                    },
                    {
                        opcode: 'sensorUltrasonicDistance',
                        text: formatMessage({
                            id: 'microPythonEsp32.sensor.sensorUltrasonicDistance',
                            default: 'ultrasonic trig [TRIG] echo [ECHO] distance(cm)',
                            description: 'microPythonEsp32 read ultrasonic distance'
                        }),
                        blockType: BlockType.REPORTER,
                        arguments: {
                            TRIG: {
                                type: ArgumentType.STRING,
                                menu: 'outPins',
                                defaultValue: this.DEFAULT_TRIG_PIN
                            },
                            ECHO: {
                                type: ArgumentType.STRING,
                                menu: 'pins',
                                defaultValue: this.DEFAULT_ECHO_PIN
                            }
                        }
                    },
                    {
                        opcode: 'sensorInternalTemperature',
                        text: formatMessage({
                            id: 'microPythonEsp32.sensor.sensorInternalTemperature',
                            default: 'chip temperature(℃)',
                            description: 'microPythonEsp32 read chip internal temperature'
                        }),
                        blockType: BlockType.REPORTER
                    }
                ],
                menus: {
                    pins: {
                        items: this.PINS_MENU
                    },
                    outPins: {
                        items: this.OUT_PINS_MENU
                    },
                    dhtType: {
                        items: this.DHT_TYPE_MENU
                    },
                    dhtData: {
                        items: this.DHT_DATA_MENU
                    }
                }
            },
            {
                id: 'wifi',
                name: formatMessage({
                    id: 'microPythonEsp32.category.wifi',
                    default: 'Wi-Fi',
                    description: 'The name of the esp32 micropython device wifi category'
                }),
                color1: '#0FBD8C',
                color2: '#0DA57A',
                color3: '#0B8E69',

                blocks: [
                    {
                        opcode: 'wifiConnect',
                        text: formatMessage({
                            id: 'microPythonEsp32.wifi.wifiConnect',
                            default: 'connect Wi-Fi [SSID] password [PASSWORD]',
                            description: 'microPythonEsp32 connect wifi'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            SSID: {
                                type: ArgumentType.STRING,
                                defaultValue: 'ssid'
                            },
                            PASSWORD: {
                                type: ArgumentType.STRING,
                                defaultValue: 'password'
                            }
                        }
                    },
                    {
                        opcode: 'wifiDisconnect',
                        text: formatMessage({
                            id: 'microPythonEsp32.wifi.wifiDisconnect',
                            default: 'disconnect Wi-Fi',
                            description: 'microPythonEsp32 disconnect wifi'
                        }),
                        blockType: BlockType.COMMAND
                    },
                    {
                        opcode: 'wifiIsConnected',
                        text: formatMessage({
                            id: 'microPythonEsp32.wifi.wifiIsConnected',
                            default: 'Wi-Fi is connected?',
                            description: 'microPythonEsp32 wifi is connected'
                        }),
                        blockType: BlockType.BOOLEAN
                    },
                    {
                        opcode: 'wifiGetIp',
                        text: formatMessage({
                            id: 'microPythonEsp32.wifi.wifiGetIp',
                            default: 'Wi-Fi IP address',
                            description: 'microPythonEsp32 get wifi ip address'
                        }),
                        blockType: BlockType.REPORTER
                    },
                    {
                        opcode: 'wifiRssi',
                        text: formatMessage({
                            id: 'microPythonEsp32.wifi.wifiRssi',
                            default: 'Wi-Fi signal strength(dBm)',
                            description: 'microPythonEsp32 wifi rssi'
                        }),
                        blockType: BlockType.REPORTER
                    }
                ]
            },
            {
                id: 'system',
                name: formatMessage({
                    id: 'microPythonEsp32.category.system',
                    default: 'System',
                    description: 'The name of the esp32 micropython device system category'
                }),
                color1: '#FF8C1A',
                color2: '#DB6E00',
                color3: '#DB6E00',

                blocks: [
                    {
                        opcode: 'systemRunningTime',
                        text: formatMessage({
                            id: 'microPythonEsp32.system.systemRunningTime',
                            default: 'running time(ms)',
                            description: 'microPythonEsp32 running time in millisecond'
                        }),
                        blockType: BlockType.REPORTER
                    },
                    {
                        opcode: 'systemDelayMs',
                        text: formatMessage({
                            id: 'microPythonEsp32.system.systemDelayMs',
                            default: 'delay [TIME] ms',
                            description: 'microPythonEsp32 delay milliseconds'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            TIME: {
                                type: ArgumentType.WHOLE_NUMBER,
                                defaultValue: '500'
                            }
                        }
                    },
                    {
                        opcode: 'systemRestart',
                        text: formatMessage({
                            id: 'microPythonEsp32.system.systemRestart',
                            default: 'restart the board',
                            description: 'microPythonEsp32 restart the board'
                        }),
                        blockType: BlockType.COMMAND
                    }
                ]
            }
        ];
    }

    /**
     * Set pin mode (realtime mode, only for peripherals supporting it).
     * @param {object} args - the block's arguments.
     * @return {Promise} - resolved when done.
     */
    esp32SetPinMode (args) {
        if (this._peripheral.setPinMode) {
            return this._peripheral.setPinMode(args.PIN, args.MODE);
        }
        return Promise.resolve();
    }

    /**
     * Set digital output (realtime mode).
     * @param {object} args - the block's arguments.
     * @return {Promise} - resolved when done.
     */
    esp32SetDigitalOutput (args) {
        if (this._peripheral.setDigitalOutput) {
            return this._peripheral.setDigitalOutput(args.PIN, args.LEVEL);
        }
        return Promise.resolve();
    }

    /**
     * Set pwm output (realtime mode).
     * @param {object} args - the block's arguments.
     * @return {Promise} - resolved when done.
     */
    esp32SetPwmOutput (args) {
        if (this._peripheral.setPwmOutput) {
            return this._peripheral.setPwmOutput(args.PIN, args.OUT);
        }
        return Promise.resolve();
    }

    /**
     * Set dac output (realtime mode).
     * @param {object} args - the block's arguments.
     * @return {Promise} - resolved when done.
     */
    esp32SetDACOutput (args) {
        if (this._peripheral.setDACOutput) {
            return this._peripheral.setDACOutput(args.PIN, args.OUT);
        }
        return Promise.resolve();
    }

    /**
     * Read digital pin (realtime mode).
     * @param {object} args - the block's arguments.
     * @return {Promise<boolean>} - the pin level.
     */
    esp32ReadDigitalPin (args) {
        if (this._peripheral.readDigitalPin) {
            return this._peripheral.readDigitalPin(args.PIN);
        }
        return Promise.resolve(false);
    }

    /**
     * Read analog pin (realtime mode).
     * @param {object} args - the block's arguments.
     * @return {Promise<number>} - the adc value.
     */
    esp32ReadAnalogPin (args) {
        if (this._peripheral.readAnalogPin) {
            return this._peripheral.readAnalogPin(args.PIN);
        }
        return Promise.resolve(0);
    }

    /**
     * Read touch pin (realtime mode).
     * @param {object} args - the block's arguments.
     * @return {Promise<number>} - the touch value.
     */
    esp32ReadTouchPin (args) {
        if (this._peripheral.readTouchPin) {
            return this._peripheral.readTouchPin(args.PIN);
        }
        return Promise.resolve(0);
    }

    /**
     * Set servo output (realtime mode).
     * @param {object} args - the block's arguments.
     * @return {Promise} - resolved when done.
     */
    setServoOutput (args) {
        if (this._peripheral.setServoOutput) {
            return this._peripheral.setServoOutput(args.PIN, args.OUT);
        }
        return Promise.resolve();
    }

    /**
     * Release the servo on a pin (realtime mode), stopping the PWM signal
     * so the servo no longer holds its position.
     * @param {object} args - the block's arguments.
     * @return {Promise} - resolved when done.
     */
    servoRelease (args) {
        if (this._peripheral.releaseServo) {
            return this._peripheral.releaseServo(args.PIN);
        }
        return Promise.resolve();
    }

    /**
     * Print text to the console (realtime mode).
     * @param {object} args - the block's arguments.
     * @return {Promise} - resolved when done.
     */
    consolePrint (args) {
        if (this._peripheral.consolePrint) {
            return this._peripheral.consolePrint(args.TEXT, args.EOL);
        }
        return Promise.resolve();
    }

    /**
     * Read console input. Not supported in realtime mode, input() would
     * block the whole live REPL channel.
     * @return {Promise<string>} - always an empty string.
     */
    consoleInput () {
        return Promise.resolve('');
    }

    /**
     * Whether the peripheral supports live (realtime) command execution.
     * @return {boolean} - true when live execution is possible right now.
     * @private
     */
    get _live () {
        return typeof this._peripheral.execLive === 'function' && this._peripheral.isReady();
    }

    /**
     * Init the neopixel strip (realtime mode).
     * @param {object} args - the block's arguments.
     * @return {Promise} - resolved when done.
     */
    neopixelInit (args) {
        if (!this._live) return Promise.resolve();
        const pin = args.PIN;
        const count = Math.max(1, Math.round(Number(args.COUNT) || 1));
        return this._peripheral.execLive(
            `import neopixel\n_ob_np = neopixel.NeoPixel(Pin(${pin}), ${count})\n` +
            `_ob_np_brt = globals().get('_ob_np_brt', 1.0)`
        ).then(() => this._peripheral.ensureLiveObject('_ob_np', ''));
    }

    /**
     * Set one neopixel color (realtime mode).
     * @param {object} args - the block's arguments.
     * @return {Promise} - resolved when done.
     */
    neopixelSetColor (args) {
        if (!this._live || !this._peripheral.hasLiveObject('_ob_np')) return Promise.resolve();
        const index = Math.round(Number(args.INDEX) || 0);
        const clamp = v => Math.min(255, Math.max(0, Math.round(Number(v) || 0)));
        return this._peripheral.execLive(
            `_ob_np[${index}] = (int(${clamp(args.R)} * _ob_np_brt), ` +
            `int(${clamp(args.G)} * _ob_np_brt), int(${clamp(args.B)} * _ob_np_brt))`
        );
    }

    /**
     * Set the neopixel brightness in percent (realtime mode). Applies to
     * the colors set afterwards, mirroring the upload mode semantics.
     * @param {object} args - the block's arguments.
     * @return {Promise} - resolved when done.
     */
    neopixelSetBrightness (args) {
        if (!this._live) return Promise.resolve();
        const raw = Number(args.BRT);
        const brt = Math.min(100, Math.max(0, isNaN(raw) ? 100 : Math.round(raw)));
        return this._peripheral.execLive(`_ob_np_brt = ${brt / 100}`);
    }

    /**
     * Refresh the neopixel strip (realtime mode).
     * @return {Promise} - resolved when done.
     */
    neopixelShow () {
        if (!this._live || !this._peripheral.hasLiveObject('_ob_np')) return Promise.resolve();
        return this._peripheral.execLive('_ob_np.write()');
    }

    /**
     * Turn off all neopixels (realtime mode).
     * @return {Promise} - resolved when done.
     */
    neopixelClear () {
        if (!this._live || !this._peripheral.hasLiveObject('_ob_np')) return Promise.resolve();
        return this._peripheral.execLive('_ob_np.fill((0, 0, 0))\n_ob_np.write()');
    }

    /**
     * Read a DHT11/DHT22 sensor (realtime mode).
     * @param {object} args - the block's arguments.
     * @return {Promise<number>} - temperature or humidity value.
     */
    async sensorDhtRead (args) {
        if (!this._live) return 0;
        const pin = args.PIN;
        const cls = args.DHTTYPE === 'DHT22' ? 'DHT22' : 'DHT11';
        const name = `_ob_dht_${pin}`;
        await this._peripheral.ensureLiveObject(`${name}_${cls}`,
            `import dht\n${name} = dht.${cls}(Pin(${pin}))`);
        const method = args.DHTDATA === 'humidity' ? 'humidity' : 'temperature';
        // measure() raises when polled faster than the sensor allows, keep
        // the previous reading in that case.
        const output = await this._peripheral.execLive(
            'try:\n' +
            `    ${name}.measure()\n` +
            'except:\n' +
            '    pass\n' +
            `print(${name}.${method}())\n`
        );
        const value = Number(String(output === null ? '' : output).trim());
        return isNaN(value) ? 0 : value;
    }

    /**
     * Read a HC-SR04 ultrasonic sensor (realtime mode).
     * @param {object} args - the block's arguments.
     * @return {Promise<number>} - distance in cm.
     */
    async sensorUltrasonicDistance (args) {
        if (!this._live) return 0;
        await this._peripheral.ensureLiveObject('_ob_sr04', SR04_FUNC);
        return this._peripheral.readLiveNumber(`_ob_sr04(${args.TRIG}, ${args.ECHO})`);
    }

    /**
     * Read the chip internal temperature (realtime mode). Newer chips
     * (C3/S3) expose mcu_temperature() in celsius, the classic ESP32 only
     * has raw_temperature() in fahrenheit.
     * @return {Promise<number>} - temperature in celsius.
     */
    async sensorInternalTemperature () {
        if (!this._live) return 0;
        await this._peripheral.ensureLiveObject('_ob_chip_temp',
            'import esp32\n' +
            'def _ob_chip_temp():\n' +
            '    if hasattr(esp32, \'mcu_temperature\'):\n' +
            '        return esp32.mcu_temperature()\n' +
            '    return round((esp32.raw_temperature() - 32) / 1.8, 1)\n');
        return this._peripheral.readLiveNumber('_ob_chip_temp()');
    }

    /**
     * Read a DS18B20 temperature sensor (realtime mode).
     * @param {object} args - the block's arguments.
     * @return {Promise<number>} - temperature in celsius.
     */
    async sensorDs18b20Read (args) {
        if (!this._live) return 0;
        await this._peripheral.ensureLiveObject('_ob_ds18b20_read',
            'import onewire\n' +
            'import ds18x20\n' +
            'def _ob_ds18b20_read(ds):\n' +
            '    try:\n' +
            '        roms = ds.scan()\n' +
            '        if not roms:\n' +
            '            return 0\n' +
            '        ds.convert_temp()\n' +
            '        time.sleep_ms(750)\n' +
            '        return round(ds.read_temp(roms[0]), 1)\n' +
            '    except:\n' +
            '        return 0\n');
        const pin = args.PIN;
        await this._peripheral.ensureLiveObject(`_ob_ds_${pin}`,
            `_ob_ds_${pin} = ds18x20.DS18X20(onewire.OneWire(Pin(${pin})))`);
        return this._peripheral.readLiveNumber(`_ob_ds18b20_read(_ob_ds_${pin})`);
    }

    /**
     * Play a tone on a buzzer pin (realtime mode).
     * @param {object} args - the block's arguments.
     * @return {Promise} - resolved when done.
     */
    esp32PlayTone (args) {
        if (!this._live) return Promise.resolve();
        const pin = args.PIN;
        const freq = Math.max(1, Math.round(Number(args.FREQ) || 1));
        let code = '';
        if (!this._peripheral.hasLiveObject(`buzzer${pin}`)) {
            code += `buzzer${pin} = PWM(Pin(${pin}), freq=${freq}, duty=0)\n`;
        }
        code += `buzzer${pin}.freq(${freq})\nbuzzer${pin}.duty(512)`;
        return this._peripheral.ensureLiveObject(`buzzer${pin}`, '')
            .then(() => this._peripheral.execLive(code));
    }

    /**
     * Stop the tone on a buzzer pin (realtime mode).
     * @param {object} args - the block's arguments.
     * @return {Promise} - resolved when done.
     */
    esp32StopTone (args) {
        if (!this._live || !this._peripheral.hasLiveObject(`buzzer${args.PIN}`)) return Promise.resolve();
        return this._peripheral.execLive(`buzzer${args.PIN}.duty(0)`);
    }

    /**
     * Fill all neopixels with one color (realtime mode).
     * @param {object} args - the block's arguments.
     * @return {Promise} - resolved when done.
     */
    neopixelFill (args) {
        if (!this._live || !this._peripheral.hasLiveObject('_ob_np')) return Promise.resolve();
        const clamp = v => Math.min(255, Math.max(0, Math.round(Number(v) || 0)));
        return this._peripheral.execLive(
            `_ob_np.fill((int(${clamp(args.R)} * _ob_np_brt), ` +
            `int(${clamp(args.G)} * _ob_np_brt), int(${clamp(args.B)} * _ob_np_brt)))`
        );
    }

    /**
     * Disconnect Wi-Fi (realtime mode).
     * @return {Promise} - resolved when done.
     */
    async wifiDisconnect () {
        if (!this._live || !this._peripheral.hasLiveObject('_ob_wlan')) return;
        await this._peripheral.execLive(
            'try:\n    _ob_wlan.disconnect()\nexcept:\n    pass\n');
    }

    /**
     * Wi-Fi signal strength in dBm (realtime mode).
     * @return {Promise<number>} - rssi or 0 when not connected.
     */
    async wifiRssi () {
        if (!this._live) return 0;
        await this._peripheral.ensureLiveObject('_ob_wlan',
            'import network\n_ob_wlan = network.WLAN(network.STA_IF)\n_ob_wlan.active(True)');
        const output = await this._peripheral.execLive(
            'try:\n    print(_ob_wlan.status(\'rssi\'))\nexcept:\n    print(0)\n');
        const value = Number(String(output === null ? '' : output).trim());
        return isNaN(value) ? 0 : value;
    }

    /**
     * Restart the board (realtime mode). The connection will drop, the
     * user reconnects manually after the reboot.
     * @return {Promise} - resolved immediately.
     */
    systemRestart () {
        if (!this._live) return Promise.resolve();
        return this._peripheral.execLive('import machine\nmachine.reset()', 1000);
    }

    /**
     * Connect to a Wi-Fi network (realtime mode). Waits on the board until
     * connected or a 12s timeout expires.
     * @param {object} args - the block's arguments.
     * @return {Promise} - resolved when done.
     */
    async wifiConnect (args) {
        if (!this._live) return;
        await this._peripheral.ensureLiveObject('_ob_wlan',
            'import network\n_ob_wlan = network.WLAN(network.STA_IF)\n_ob_wlan.active(True)');
        const code =
            `_ob_wlan.connect(${pyStr(args.SSID)}, ${pyStr(args.PASSWORD)})\n` +
            '_ob_t = time.ticks_ms()\n' +
            'while not _ob_wlan.isconnected() and time.ticks_diff(time.ticks_ms(), _ob_t) < 12000:\n' +
            '    time.sleep_ms(200)\n';
        await this._peripheral.execLive(code, 15000);
    }

    /**
     * Whether Wi-Fi is connected (realtime mode).
     * @return {Promise<boolean>} - true when connected.
     */
    async wifiIsConnected () {
        if (!this._live) return false;
        await this._peripheral.ensureLiveObject('_ob_wlan',
            'import network\n_ob_wlan = network.WLAN(network.STA_IF)\n_ob_wlan.active(True)');
        return (await this._peripheral.readLiveString('_ob_wlan.isconnected()')) === 'True';
    }

    /**
     * Get the Wi-Fi IP address (realtime mode).
     * @return {Promise<string>} - the ip address or empty string.
     */
    async wifiGetIp () {
        if (!this._live) return '';
        await this._peripheral.ensureLiveObject('_ob_wlan',
            'import network\n_ob_wlan = network.WLAN(network.STA_IF)\n_ob_wlan.active(True)');
        const ip = await this._peripheral.readLiveString('_ob_wlan.ifconfig()[0]');
        return ip === '0.0.0.0' ? '' : ip;
    }

    /**
     * Running time since boot in milliseconds (realtime mode).
     * @return {Promise<number>} - milliseconds since boot.
     */
    systemRunningTime () {
        if (!this._live) return Promise.resolve(0);
        return this._peripheral.readLiveNumber('time.ticks_ms()');
    }

    /**
     * Delay for some milliseconds. In realtime mode the wait happens in the
     * browser so the REPL channel stays free.
     * @param {object} args - the block's arguments.
     * @return {Promise} - resolved when the delay elapsed.
     */
    systemDelayMs (args) {
        if (!this._live) return Promise.resolve();
        const ms = Math.max(0, Number(args.TIME) || 0);
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = OpenBlockMicroPythonEsp32Device;
