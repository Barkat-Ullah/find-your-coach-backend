import { formatTimeWithAMPM } from "../Schedule/Schedule.constants";

export const getWeeklySchedule = (
  availabilities: any[],
): Record<string, string> => {
  const days = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];

  // Initialize the full week schedule with "Not Available"
  const weeklySchedule: Record<string, string> = {
    Monday: 'Not Available',
    Tuesday: 'Not Available',
    Wednesday: 'Not Available',
    Thursday: 'Not Available',
    Friday: 'Not Available',
    Saturday: 'Not Available',
    Sunday: 'Not Available',
  };

  for (const availability of availabilities) {
    const date = new Date(availability.slotDate);
    const dayOfWeekIndex = date.getDay();
    const dayName = days[dayOfWeekIndex];

    // Assuming formatTimeWithAMPM is available globally or imported
    const startTime = formatTimeWithAMPM(availability.startTime);
    const endTime = formatTimeWithAMPM(availability.endTime);

    const timeRange = `${startTime} - ${endTime}`;
    weeklySchedule[dayName] = timeRange;
  }

  // Reorder the output to start from Monday
  const orderedSchedule: Record<string, string> = {};
  const orderedDays = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];

  orderedDays.forEach(day => {
    orderedSchedule[day] = weeklySchedule[day];
  });

  return orderedSchedule;
};
