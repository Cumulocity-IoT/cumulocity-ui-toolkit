# Cumulocity Operations Widget

The Operations Widget enables Cumulocity IoT users to send predefined or custom operations from the Cockpit application.
Once you have selected the widget within the widget gallery you will find the widget configuration menu. There you can define multiple buttons, which make defined operations triggerable from inside the widget.
For each added button you can configure different parameters of the operation and the style of the buttons.
In Define fields column, user can define the key, label and field type (Text / Number / Dropdown).
Based on the selection of field type, the corresponding options will appear in the popup when the user clicks the button in the widget.
User can define the operation JSON object in Operation value (or) user can define the fields in the configuration menu.
If user defines both fields, user entered values in the popup will be appended in the Operation Value fields.

![Operation Config](./public/widget.png)

## Prequisites

    Cumulocity UI > 10.18

## Parameters to configure

| Field              | Description                                                            |
| ------------------ | ---------------------------------------------------------------------- |
| Title              | Title of the widget.                                                   |
| Label              | The label of the button.                                               |
| Description        | Description of the operation, which should be triggered by the button. |
| Operation Fragment | The operation fragment, which should be sent.                          |
| Operation Value    | The operation JSON object.                                             |
| Define Fields      | Define field types key and label.                                      |
| Button             | The button type (color).                                               |
| Icon               | The button icon.                                                       |

![Operation Widget Config](./public/config.png)

When all buttons are configured, you can hit "Save" and find the buttons within the widget.

---
