# Const to type

A simple method to abstract values used in code (e.g. values/fragments on a MO), and use it as a type.

```typescript
// declare the const
export const MyType = {
  foo: 'FOO_VALUE',
  bar: 'BAR_VALUE',
  baz: 'BAZ_VALUE',
};
// convert to type
export type MyType = (typeof MyType)[keyof typeof MyType];

// use type and const
const myFoo: MyType = MyType.foo;
console.log(myFoo); // => 'FOO_VALUE'
```
