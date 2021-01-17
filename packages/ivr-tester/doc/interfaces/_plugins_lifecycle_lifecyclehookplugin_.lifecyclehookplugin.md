**[IVR Tester](../README.md)**

> [Globals](../README.md) / ["plugins/lifecycle/LifecycleHookPlugin"](../modules/_plugins_lifecycle_lifecyclehookplugin_.md) / LifecycleHookPlugin

# Interface: LifecycleHookPlugin

Interface for developing a plugin that hooks into the life-cycle of a
test.

## Hierarchy

* **LifecycleHookPlugin**

## Implemented by

* [CloseServerWhenTestsComplete](../classes/_testing_closeserverwhentestscomplete_.closeserverwhentestscomplete.md)

## Index

### Methods

* [initialise](_plugins_lifecycle_lifecyclehookplugin_.lifecyclehookplugin.md#initialise)
* [name](_plugins_lifecycle_lifecyclehookplugin_.lifecyclehookplugin.md#name)

## Methods

### initialise

▸ **initialise**(`eventEmitter`: [LifecycleEventEmitter](_plugins_lifecycle_lifecycleeventemitter_.lifecycleeventemitter.md)): void

*Defined in [packages/ivr-tester/src/plugins/lifecycle/LifecycleHookPlugin.ts:9](https://github.com/SketchingDev/ivr-tester/blob/44e6705/packages/ivr-tester/src/plugins/lifecycle/LifecycleHookPlugin.ts#L9)*

#### Parameters:

Name | Type |
------ | ------ |
`eventEmitter` | [LifecycleEventEmitter](_plugins_lifecycle_lifecycleeventemitter_.lifecycleeventemitter.md) |

**Returns:** void

___

### name

▸ **name**(): string

*Defined in [packages/ivr-tester/src/plugins/lifecycle/LifecycleHookPlugin.ts:8](https://github.com/SketchingDev/ivr-tester/blob/44e6705/packages/ivr-tester/src/plugins/lifecycle/LifecycleHookPlugin.ts#L8)*

**Returns:** string