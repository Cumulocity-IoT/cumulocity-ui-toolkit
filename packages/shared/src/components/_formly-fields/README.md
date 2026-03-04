# Formly fields

## Usage / Installation

Within your module, add a new import that declares the custom formly field type:

```typescript
import { TimeFieldType } from './time.formly/time.formly.component';

@NgModule({
  declarations: [...],
  providers: [...],
  imports: [
    FormlyModule.forChild({
      types: [
        { name: 'time', component: TimeFieldType },
      ],
    }),
  ]
});
```

Then, within the component hosting the formly form, you can use the custom component within the `FormlyFieldConfig`:

```typescript
fields: FormlyFieldConfig[] = [
  {
    key: 'my-time',
    type: 'time', // the custom type name declared in the module
    props: {
      label: 'My Time',
    },
  },
];
```
