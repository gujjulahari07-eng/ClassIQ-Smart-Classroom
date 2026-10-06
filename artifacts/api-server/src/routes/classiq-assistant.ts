import { Router, type IRouter } from "express";
import {
  AskClassroomAssistantBody,
  AskClassroomAssistantResponse,
} from "@workspace/api-zod";

type Room = {
  id: string;
  room_number: string;
  name: string;
  capacity: number;
  status: string;
};

type Device = {
  id: string;
  classroom_id: string;
  name: string;
  device_type: string;
  status: string;
  current_power: number | string;
  power_rating: number | string;
  health_score: number | string;
};

type Sensor = {
  classroom_id: string;
  sensor_type: string;
  value: number | string;
  unit: string;
};

type EnergyReading = {
  classroom_id: string;
  energy_kwh: number | string;
  estimated_cost: number | string;
  recorded_at: string;
};

type Ticket = {
  classroom_id: string | null;
  title: string;
  priority: string;
  status: string;
};

type Alert = {
  title: string;
  severity: string;
  is_read: boolean;
};

type AttendanceRow = {
  student_id: string;
  status: string;
};

const router: IRouter = Router();
const SUPABASE_PAGE_SIZE = 1000;

function numberValue(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function authHeaders(publishableKey: string, token: string) {
  return {
    apikey: publishableKey,
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}

async function fetchRows<T>(
  baseUrl: string,
  publishableKey: string,
  token: string,
  table: string,
  query: Record<string, string>,
): Promise<T[]> {
  const url = new URL(`/rest/v1/${table}`, baseUrl);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

  const response = await fetch(url, {
    headers: authHeaders(publishableKey, token),
  });
  if (!response.ok) throw new Error(`Supabase query failed for ${table}`);
  const result: unknown = await response.json();
  if (!Array.isArray(result)) throw new Error(`Supabase returned an invalid ${table} response`);
  return result as T[];
}

async function fetchEnergyReadings(
  baseUrl: string,
  publishableKey: string,
  token: string,
): Promise<EnergyReading[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const rows: EnergyReading[] = [];

  for (let page = 0; page < 10; page += 1) {
    const start = page * SUPABASE_PAGE_SIZE;
    const url = new URL("/rest/v1/energy_readings", baseUrl);
    url.searchParams.set("select", "classroom_id,energy_kwh,estimated_cost,recorded_at");
    url.searchParams.set("recorded_at", `gte.${since}`);
    url.searchParams.set("order", "recorded_at.desc");
    const response = await fetch(url, {
      headers: {
        ...authHeaders(publishableKey, token),
        Range: `${start}-${start + SUPABASE_PAGE_SIZE - 1}`,
      },
    });
    if (!response.ok) throw new Error("Supabase energy query failed");
    const pageRows: unknown = await response.json();
    if (!Array.isArray(pageRows)) throw new Error("Supabase returned invalid energy data");
    rows.push(...(pageRows as EnergyReading[]));
    if (pageRows.length < SUPABASE_PAGE_SIZE) break;
  }
  return rows;
}

function makeAnswer(
  question: string,
  rooms: Room[],
  devices: Device[],
  sensors: Sensor[],
  energy: EnergyReading[],
  tickets: Ticket[],
  alerts: Alert[],
  attendance: AttendanceRow[],
) {
  const normalized = question.toLowerCase();
  const roomName = (id: string | null | undefined) =>
    rooms.find((room) => room.id === id)?.room_number ?? "Unknown classroom";

  if (/energy|power|consum|kwh|cost|forecast|tomorrow|week/.test(normalized)) {
    if (/forecast|tomorrow|predict/.test(normalized)) {
      const byDate = new Map<string, number>();
      for (const reading of energy) {
        const date = reading.recorded_at.slice(0, 10);
        byDate.set(date, (byDate.get(date) ?? 0) + numberValue(reading.energy_kwh));
      }
      const dailyTotals = [...byDate.values()].filter((total) => total > 0);
      if (dailyTotals.length === 0) {
        return {
          answer: "There are no energy readings in the last seven days, so I can’t produce a data-based forecast yet.",
          sources: ["energy_readings"],
        };
      }
      const average = dailyTotals.reduce((total, value) => total + value, 0) / dailyTotals.length;
      return {
        answer: `A simple forecast based on ${dailyTotals.length} days of recent readings is ${average.toFixed(1)} kWh for tomorrow. This is a historical-average estimate, not a machine-learning prediction.`,
        sources: ["energy_readings"],
      };
    }

    const totals = new Map<string, { kwh: number; cost: number }>();
    for (const reading of energy) {
      const current = totals.get(reading.classroom_id) ?? { kwh: 0, cost: 0 };
      current.kwh += numberValue(reading.energy_kwh);
      current.cost += numberValue(reading.estimated_cost);
      totals.set(reading.classroom_id, current);
    }
    const highest = [...totals.entries()].sort((a, b) => b[1].kwh - a[1].kwh)[0];
    const livePower = devices.reduce(
      (sum, device) => sum + (device.status === "ON" ? numberValue(device.current_power) : 0),
      0,
    );
    const totalKwh = [...totals.values()].reduce((sum, value) => sum + value.kwh, 0);
    const totalCost = [...totals.values()].reduce((sum, value) => sum + value.cost, 0);
    const roomNameMatch = rooms.find((room) => normalized.includes(room.room_number.toLowerCase()));
    if (roomNameMatch && totals.has(roomNameMatch.id)) {
      const detail = totals.get(roomNameMatch.id)!;
      return {
        answer: `${roomNameMatch.room_number} has ${detail.kwh.toFixed(1)} kWh and an estimated cost of ₹${detail.cost.toFixed(2)} across the available seven-day readings. Current campus draw is ${livePower.toFixed(0)} W.`,
        sources: ["energy_readings", "devices"],
      };
    }
    return {
      answer: highest
        ? `${roomName(highest[0])} has the highest recorded energy use in the last seven days at ${highest[1].kwh.toFixed(1)} kWh. Campus total is ${totalKwh.toFixed(1)} kWh (estimated ₹${totalCost.toFixed(2)}); current device draw is ${livePower.toFixed(0)} W.`
        : `Current connected devices draw ${livePower.toFixed(0)} W. No energy readings are available for the last seven days.`,
      sources: ["energy_readings", "devices", "classrooms"],
    };
  }

  if (/occup|empty|room|classroom|temperature|temp|co2|air quality|comfort/.test(normalized)) {
    const occupancyRows = sensors.filter((sensor) => sensor.sensor_type === "OCCUPANCY");
    const occupied = occupancyRows.filter((sensor) => numberValue(sensor.value) > 0);
    const totalPeople = occupied.reduce((sum, sensor) => sum + numberValue(sensor.value), 0);
    const mentioned = rooms.find((room) => normalized.includes(room.room_number.toLowerCase()));
    if (mentioned) {
      const readings = sensors.filter((sensor) => sensor.classroom_id === mentioned.id);
      const occupancy = readings.find((sensor) => sensor.sensor_type === "OCCUPANCY");
      const temperature = readings.find((sensor) => sensor.sensor_type === "TEMPERATURE");
      const co2 = readings.find((sensor) => sensor.sensor_type === "CO2");
      return {
        answer: `${mentioned.room_number} is ${mentioned.status.toLowerCase()} with ${numberValue(occupancy?.value)} occupants${temperature ? `, ${numberValue(temperature.value).toFixed(1)}°C` : ""}${co2 ? `, and ${numberValue(co2.value).toFixed(0)} ppm CO₂` : ""}.`,
        sources: ["classrooms", "sensors"],
      };
    }
    return {
      answer: `${occupied.length} of ${rooms.length} classrooms currently report occupancy, with ${totalPeople.toFixed(0)} people in total.`,
      sources: ["classrooms", "sensors"],
    };
  }

  if (/maint|health|fault|fail|device/.test(normalized)) {
    const weakDevices = devices.filter((device) => numberValue(device.health_score) < 70 || device.status === "OFFLINE" || device.status === "FAULT");
    const openTickets = tickets.filter((ticket) => ticket.status !== "RESOLVED");
    const examples = weakDevices.slice(0, 4).map((device) =>
      `${device.name} (${roomName(device.classroom_id)}, ${numberValue(device.health_score).toFixed(0)}% health)`,
    );
    return {
      answer: weakDevices.length
        ? `${weakDevices.length} devices need attention; ${openTickets.length} maintenance tickets are open. ${examples.join("; ")}${weakDevices.length > 4 ? "; and more" : ""}.`
        : `No devices are currently below the 70% health threshold. There are ${openTickets.length} unresolved maintenance tickets.`,
      sources: ["devices", "maintenance_tickets"],
    };
  }

  if (/alert|warning|notification/.test(normalized)) {
    const unread = alerts.filter((alert) => !alert.is_read);
    const critical = unread.filter((alert) => alert.severity === "CRITICAL").length;
    return {
      answer: `${unread.length} unread alerts are available, including ${critical} critical alerts.`,
      sources: ["alerts"],
    };
  }

  if (/attend|present|absent|late|student/.test(normalized)) {
    const counts = new Map<string, { total: number; present: number }>();
    for (const row of attendance) {
      const count = counts.get(row.student_id) ?? { total: 0, present: 0 };
      count.total += 1;
      if (row.status === "PRESENT" || row.status === "LATE") count.present += 1;
      counts.set(row.student_id, count);
    }
    const lowAttendance = [...counts.values()].filter((count) => count.total > 0 && count.present / count.total < 0.75).length;
    const average = counts.size
      ? [...counts.values()].reduce((sum, count) => sum + count.present / count.total, 0) / counts.size
      : 0;
    return {
      answer: counts.size
        ? `Across ${counts.size} students with attendance records, the average is ${(average * 100).toFixed(1)}%. ${lowAttendance} are below 75%.`
        : "No attendance records are available yet.",
      sources: ["attendance"],
    };
  }

  return {
    answer: "I can answer questions about energy use, occupancy, room conditions, device health, maintenance, alerts, and attendance using live records. No language model is configured, so answers are intentionally rule-based and never invent missing data.",
    sources: ["live Supabase records"],
  };
}

router.post("/classiq/assistant", async (req, res): Promise<void> => {
  const input = AskClassroomAssistantBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Enter a question of 1–500 characters." });
    return;
  }

  const authorization = req.header("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    res.status(401).json({ error: "Sign in to ask about classroom data." });
    return;
  }

  const baseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!baseUrl || !publishableKey) {
    res.status(503).json({ error: "Supabase connection is not configured on the server." });
    return;
  }

  try {
    const authResponse = await fetch(new URL("/auth/v1/user", baseUrl), {
      headers: authHeaders(publishableKey, token),
    });
    if (!authResponse.ok) {
      res.status(401).json({ error: "Your session has expired. Sign in again." });
      return;
    }

    const [rooms, devices, sensors, energy, tickets, alerts, attendance] = await Promise.all([
      fetchRows<Room>(baseUrl, publishableKey, token, "classrooms", {
        select: "id,room_number,name,capacity,status",
        order: "room_number.asc",
        limit: "100",
      }),
      fetchRows<Device>(baseUrl, publishableKey, token, "devices", {
        select: "id,classroom_id,name,device_type,status,current_power,power_rating,health_score",
        limit: "500",
      }),
      fetchRows<Sensor>(baseUrl, publishableKey, token, "sensors", {
        select: "classroom_id,sensor_type,value,unit",
        limit: "500",
      }),
      fetchEnergyReadings(baseUrl, publishableKey, token),
      fetchRows<Ticket>(baseUrl, publishableKey, token, "maintenance_tickets", {
        select: "classroom_id,title,priority,status",
        order: "created_at.desc",
        limit: "200",
      }),
      fetchRows<Alert>(baseUrl, publishableKey, token, "alerts", {
        select: "title,severity,is_read",
        order: "created_at.desc",
        limit: "200",
      }),
      fetchRows<AttendanceRow>(baseUrl, publishableKey, token, "attendance", {
        select: "student_id,status",
        order: "attendance_date.desc",
        limit: "1000",
      }),
    ]);

    const answer = makeAnswer(input.data.question, rooms, devices, sensors, energy, tickets, alerts, attendance);
    res.json(AskClassroomAssistantResponse.parse(answer));
  } catch (error) {
    req.log.error({ err: error }, "ClassIQ assistant could not read live Supabase data");
    res.status(503).json({ error: "Classroom data is temporarily unavailable. Check your Supabase setup and try again." });
  }
});

export default router;
