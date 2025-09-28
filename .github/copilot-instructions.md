# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.4.0
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

## Project Context

You are working on an ioBroker adapter. ioBroker is an integration platform for the Internet of Things, focused on building smart home and industrial IoT solutions. Adapters are plugins that connect ioBroker to external systems, devices, or services.

### LG TV RS232 Adapter Specific Context

This adapter controls LG TV devices through RS232 serial communication using an Ethernet-to-Serial gateway. Key characteristics:

- **Primary Function**: Control LG TVs via RS232 commands over TCP/IP network connection
- **Target Hardware**: LG TV models with RS232 support (starting from LD750 series)
- **Gateway Requirement**: Arduino-compatible RS232-to-Ethernet converter running ArduinoSerialToEthernet firmware
- **Communication Protocol**: TCP socket connection to gateway, which translates to RS232 serial commands
- **Command Structure**: Uses predefined command set stored in `admin/commands.json`
- **Connection Details**: Default TCP connection to `127.0.0.1:23` (configurable via adapter settings)
- **State Management**: Creates `info.connection` state to track TV connection status

#### Hardware Architecture
```
ioBroker Adapter ↔ TCP/IP Network ↔ Arduino Gateway (W5100/W5500 + RS232-TTL) ↔ LG TV RS232 Port
```

#### Key Dependencies and Configuration
- **Core Framework**: `@iobroker/adapter-core` for base adapter functionality
- **Network Communication**: Built-in Node.js `net` module for TCP socket connections
- **Configuration**: Host IP and port settings for the Arduino gateway
- **Command Database**: JSON-based command definitions for LG TV control

## Testing

### Unit Testing
- Use Jest as the primary testing framework for ioBroker adapters
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files to allow testing of functionality without live connections
- Example test structure:
  ```javascript
  describe('AdapterName', () => {
    let adapter;
    
    beforeEach(() => {
      // Setup test adapter instance
    });
    
    test('should initialize correctly', () => {
      // Test adapter initialization
    });
  });
  ```

### Integration Testing

**IMPORTANT**: Use the official `@iobroker/testing` framework for all integration tests. This is the ONLY correct way to test ioBroker adapter integration.

**Official Documentation**: https://github.com/ioBroker/testing

#### Framework Structure
Integration tests MUST follow this exact pattern:

```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

// Define test coordinates or configuration
const TEST_HOST = '192.168.1.100';
const TEST_PORT = 23;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Use tests.integration() with defineAdditionalTests
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test LGTV-RS adapter with specific configuration', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should configure and start adapter', function () {
                return new Promise(async (resolve, reject) => {
                    try {
                        harness = getHarness();
                        
                        // Get adapter object using promisified pattern
                        const obj = await new Promise((res, rej) => {
                            harness.objects.getObject('system.adapter.lgtv-rs.0', (err, o) => {
                                if (err) return rej(err);
                                res(o);
                            });
                        });
                        
                        if (!obj) {
                            return reject(new Error('Adapter object not found'));
                        }

                        // Configure adapter properties for LG TV RS232
                        Object.assign(obj.native, {
                            host: TEST_HOST,
                            port: TEST_PORT
                        });

                        // Set the updated configuration
                        harness.objects.setObject(obj._id, obj);

                        console.log('✅ Step 1: Configuration written, starting adapter...');
                        
                        // Start adapter and wait
                        await harness.startAdapterAndWait();
                        
                        console.log('✅ Step 2: Adapter started');

                        // Wait for adapter to process connection
                        const waitMs = 15000;
                        await wait(waitMs);

                        console.log('🔍 Step 3: Checking states after adapter run...');
                        
                        // Get all states created by adapter
                        const stateIds = await harness.dbConnection.getStateIDs('lgtv-rs.0.*');
                        
                        console.log(`📊 Found ${stateIds.length} states`);

                        if (stateIds.length > 0) {
                            console.log('✅ Adapter successfully created states');
                            
                            // Show sample of created states
                            const allStates = await new Promise((res, rej) => {
                                harness.states.getStates(stateIds, (err, states) => {
                                    if (err) return rej(err);
                                    res(states || []);
                                });
                            });
                            
                            console.log('📋 Sample states created:');
                            stateIds.slice(0, 5).forEach((stateId, index) => {
                                const state = allStates[index];
                                console.log(`   ${stateId}: ${state && state.val !== undefined ? state.val : 'undefined'}`);
                            });
                            
                            await harness.stopAdapter();
                            resolve(true);
                        } else {
                            console.log('❌ No states were created by the adapter');
                            reject(new Error('Adapter did not create any states'));
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            }).timeout(40000);
        });
    }
});
```

#### Testing Both Success AND Failure Scenarios

**IMPORTANT**: For every "it works" test, implement corresponding "it doesn't work and fails" tests. This ensures proper error handling and validates that your adapter fails gracefully when expected.

```javascript
// Example: Testing successful configuration
it('should configure and start adapter with valid configuration', function () {
    return new Promise(async (resolve, reject) => {
        // ... successful configuration test as shown above
    });
}).timeout(40000);

// Example: Testing connection failure scenarios for LG TV RS232
it('should handle connection failure gracefully', function () {
    return new Promise(async (resolve, reject) => {
        try {
            harness = getHarness();
            
            console.log('🔍 Step 1: Fetching adapter object...');
            const obj = await new Promise((res, rej) => {
                harness.objects.getObject('system.adapter.lgtv-rs.0', (err, o) => {
                    if (err) return rej(err);
                    res(o);
                });
            });
            
            if (!obj) return reject(new Error('Adapter object not found'));
            console.log('✅ Step 1.5: Adapter object loaded');

            console.log('🔍 Step 2: Updating adapter config with invalid host...');
            Object.assign(obj.native, {
                host: '192.168.255.255', // Non-existent host to test failure
                port: 23
            });

            await new Promise((res, rej) => {
                harness.objects.setObject(obj._id, obj, (err) => {
                    if (err) return rej(err);
                    console.log('✅ Step 2.5: Adapter object updated');
                    res(undefined);
                });
            });

            console.log('🔍 Step 3: Starting adapter...');
            await harness.startAdapterAndWait();
            console.log('✅ Step 4: Adapter started');

            console.log('⏳ Step 5: Waiting 20 seconds for connection attempt...');
            await new Promise((res) => setTimeout(res, 20000));

            console.log('🔍 Step 6: Checking connection state...');
            const connectionState = await new Promise((res, rej) => {
                harness.states.getState('lgtv-rs.0.info.connection', (err, state) => {
                    if (err) return rej(err);
                    res(state);
                });
            });

            if (connectionState && connectionState.val === false) {
                console.log('✅ Adapter correctly reports disconnected state');
                resolve(true);
            } else {
                console.log('❌ Adapter did not handle connection failure properly');
                return reject(new Error('Expected connection state to be false'));
            }

            await harness.stopAdapter();
            console.log('🛑 Adapter stopped');
        } catch (error) {
            reject(error);
        }
    });
}).timeout(40000);

// Example: Testing missing required configuration  
it('should handle missing host configuration properly', function () {
    return new Promise(async (resolve, reject) => {
        try {
            harness = getHarness();
            
            console.log('🔍 Step 1: Fetching adapter object...');
            const obj = await new Promise((res, rej) => {
                harness.objects.getObject('system.adapter.lgtv-rs.0', (err, o) => {
                    if (err) return rej(err);
                    res(o);
                });
            });
            
            if (!obj) return reject(new Error('Adapter object not found'));

            console.log('🔍 Step 2: Removing required host configuration...');
            // Remove required configuration to test failure handling
            delete obj.native.host; // This should cause graceful handling

            await new Promise((res, rej) => {
                harness.objects.setObject(obj._id, obj, (err) => {
                    if (err) return rej(err);
                    res(undefined);
                });
            });

            console.log('🔍 Step 3: Starting adapter...');
            await harness.startAdapterAndWait();

            console.log('⏳ Step 4: Waiting for adapter to process...');
            await new Promise((res) => setTimeout(res, 10000));

            console.log('🔍 Step 5: Checking adapter behavior...');
            const stateIds = await harness.dbConnection.getStateIDs('lgtv-rs.0.*');

            // Check if adapter handled missing configuration gracefully
            if (stateIds.length === 0) {
                console.log('✅ Adapter properly handled missing configuration - no invalid states created');
                resolve(true);
            } else {
                // Check if connection state shows appropriate error
                const connectionState = await new Promise((res, rej) => {
                    harness.states.getState('lgtv-rs.0.info.connection', (err, state) => {
                        if (err) return rej(err);
                        res(state);
                    });
                });
                
                if (connectionState && connectionState.val === false) {
                    console.log('✅ Adapter created connection state but marked as disconnected due to config error');
                    resolve(true);
                } else {
                    reject(new Error('Adapter should not create valid connection without host configuration'));
                }
            }

            await harness.stopAdapter();
        } catch (error) {
            reject(error);
        }
    });
}).timeout(40000);
```

#### Testing Network Connection Scenarios

For LG TV RS232 adapters, add specific tests for:

```javascript
it('should handle network timeout properly', function () {
    // Test connection timeout scenarios
});

it('should reconnect after network interruption', function () {
    // Test automatic reconnection logic
});

it('should validate command format before sending', function () {
    // Test command validation for RS232 protocol
});
```

### Test File Structure

Organize test files in the following structure:
```
test/
├── mocharc.custom.json         # Mocha configuration
├── integration.js              # Integration tests using @iobroker/testing
├── unit/                      # Unit tests
│   ├── adapter.test.js        # Main adapter functionality
│   └── helpers.test.js        # Helper functions
└── fixtures/                  # Test data files
    └── sample-commands.json    # Sample RS232 commands for testing
```

## Development Guidelines

### Code Structure

#### Main Adapter File (`main.js`)
- Initialize with proper error handling for network connections
- Implement connection state tracking
- Handle RS232 command sending and response parsing
- Provide proper cleanup in `unload()` method

```javascript
class LgtvRs extends utils.Adapter {
    constructor(options = {}) {
        super({ ...options, name: 'lgtv-rs' });
        this.connected = false;
        this.client = null;
    }

    async onReady() {
        // Validate configuration
        if (!this.config.host) {
            this.log.error('No host configured');
            return;
        }
        
        // Initialize connection
        await this.connectToGateway();
    }

    async connectToGateway() {
        // TCP connection logic with error handling
    }

    onUnload(callback) {
        try {
            if (this.client) {
                this.client.destroy();
            }
            callback();
        } catch (e) {
            callback();
        }
    }
}
```

#### Configuration Validation

Always validate adapter configuration:
```javascript
validateConfig() {
    if (!this.config.host || this.config.host.trim() === '') {
        this.log.error('Host configuration is required');
        return false;
    }
    
    if (!this.config.port || this.config.port < 1 || this.config.port > 65535) {
        this.log.error('Valid port configuration is required (1-65535)');
        return false;
    }
    
    return true;
}
```

### Error Handling

Implement comprehensive error handling:
- Network connection errors
- Socket timeout handling
- Invalid command responses
- Gateway communication failures

```javascript
handleConnectionError(error) {
    this.log.warn(`Connection error: ${error.message}`);
    this.setState('info.connection', false, true);
    
    // Implement reconnection logic with exponential backoff
    this.scheduleReconnect();
}
```

### State Management

#### Connection Status
Always maintain connection state:
```javascript
this.setStateAsync('info.connection', { val: connected, ack: true });
```

#### Command States  
Create states for TV control commands based on `admin/commands.json`:
```javascript
async createCommandStates() {
    const commands = require('./admin/commands.json');
    for (const command of commands) {
        await this.setObjectNotExistsAsync(`commands.${command.id}`, {
            type: 'state',
            common: {
                name: command.name,
                type: 'boolean',
                role: 'button',
                read: false,
                write: true
            },
            native: {
                command: command.code
            }
        });
    }
}
```

### RS232 Communication Patterns

#### Command Structure
LG TV RS232 commands typically follow this pattern:
```
[Command][Space][Set_ID][Space][Data][Carriage Return]
```

Example implementation:
```javascript
sendCommand(command, setId = '01', data = '') {
    const cmdString = `${command} ${setId} ${data}\r`;
    if (this.client && this.connected) {
        this.client.write(cmdString);
        this.log.debug(`Sent command: ${cmdString.trim()}`);
    } else {
        this.log.warn('Cannot send command - not connected to gateway');
    }
}
```

### Logging Best Practices

Use appropriate log levels:
```javascript
this.log.error('Critical errors that prevent adapter from working');
this.log.warn('Important warnings about configuration or connectivity');
this.log.info('General adapter status and major operations');
this.log.debug('Detailed debugging information including commands sent/received');
```

### Performance Considerations

#### Connection Management
- Implement connection pooling for multiple TV control
- Use keep-alive mechanisms to prevent connection drops
- Handle reconnection with exponential backoff

#### Command Queuing
For multiple rapid commands:
```javascript
class CommandQueue {
    constructor(adapter) {
        this.adapter = adapter;
        this.queue = [];
        this.processing = false;
    }
    
    async addCommand(command, setId, data) {
        this.queue.push({ command, setId, data });
        if (!this.processing) {
            await this.processQueue();
        }
    }
    
    async processQueue() {
        this.processing = true;
        while (this.queue.length > 0) {
            const cmd = this.queue.shift();
            await this.adapter.sendCommand(cmd.command, cmd.setId, cmd.data);
            await new Promise(resolve => setTimeout(resolve, 100)); // Delay between commands
        }
        this.processing = false;
    }
}
```

## Security Guidelines

### Network Security
- Validate all incoming data from the gateway
- Implement proper timeout handling to prevent hanging connections
- Use secure network practices when configuring gateway connections

### Configuration Security  
- Validate all user inputs in adapter configuration
- Sanitize command inputs to prevent injection attacks
- Log security-relevant events appropriately

### Access Control
- Document required network access for the gateway
- Provide guidance on firewall configuration
- Implement proper error messages without exposing sensitive system information

## Documentation Guidelines

### README Updates
When adding new features, update:
- Supported TV models list
- Configuration instructions for gateway setup
- Troubleshooting section for common connection issues

### Code Comments
Focus comments on:
- RS232 protocol specifics and command explanations
- Gateway communication patterns
- Error handling and recovery strategies
- Configuration requirements and validation logic

### Change Log Maintenance
Document all changes affecting:
- Command protocol modifications
- Gateway compatibility updates
- New supported TV models
- Breaking configuration changes
