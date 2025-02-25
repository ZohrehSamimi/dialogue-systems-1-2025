# dialogue-systems-1-2025
Key Changes and Features:

1. Extended Context:
Added name, date, time, and allDay to the context for storing appointment details.

2. State Flow:
Start → Initiates the flow.
AskName → ListenName: Captures the name.
AskDate → ListenDate: Captures the date.
AskAllDay → ListenAllDay: Checks if it's an all-day event.
AskTime → ListenTime: Captures the time if not all-day.
Confirm → ListenConfirm: Confirms the details with the user.
CreateAppointment: Creates the appointment.
End: Ends the flow.

3. Enhanced Grammar Recognition:
Included checks for multiple confirmations (yes, yup, sure, of course) and rejections (no, nope, not at all).

4. Confirmation Logic:
Different confirmation prompts for all-day vs. time-specific meetings.
---------------------------------------------------------------------------------------------------------------
