import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const APP_URL = process.env.APP_URL || "http://localhost:3000";

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.warn("WARNING: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing. OAuth will fail.");
}

if (!SPREADSHEET_ID) {
  console.warn("WARNING: SPREADSHEET_ID is missing. Sheet operations will fail.");
}

// Helper for Google OAuth
const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  `${APP_URL}/auth/callback`
);

// API routes
app.get("/api/auth/url", (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ error: "Google OAuth credentials not configured in Secrets." });
  }
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });
  res.json({ url });
});

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    // In a real app, we would save this to a session or database.
    // For this applet, we'll send it back to the client to store in local storage (simplified for demo).
    res.send(`
      <html>
        <body>
          <script>
            window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', tokens: ${JSON.stringify(tokens)} }, '*');
            window.close();
          </script>
          <p>Authentication successful. You can close this window.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error exchanging code for tokens", error);
    res.status(500).send("Authentication failed");
  }
});

// API to get matches and summary data
app.get("/api/data", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

  const token = authHeader.split(" ")[1];
  if (!token || token === "undefined") {
    return res.status(401).json({ error: "Mã xác thực không hợp lệ. Vui lòng đăng nhập lại." });
  }
  
  try {
    const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    auth.setCredentials({ access_token: token });

    const sheets = google.sheets({ version: "v4", auth });

    // Update ranges based on user feedback
    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: SPREADSHEET_ID,
      ranges: ["Bình chọn!A4:I", "BangXepHang!A:Z", "GhiNhan!A:Z"],
    });

    const valueRanges = response.data.valueRanges || [];
    const matchesData = valueRanges[0]?.values || [];
    const summaryData = valueRanges[1]?.values || [];
    const votesData = valueRanges[2]?.values || [];

    res.json({ matches: matchesData, summary: summaryData, votes: votesData });
  } catch (error: any) {
    console.error("Error reading from sheets", error.message);
    if (error.code === 401 || error.message.includes("invalid authentication credentials") || error.message.includes("auth")) {
      return res.status(401).json({ error: "Phiên làm việc hết hạn. Vui lòng đăng nhập lại." });
    }
    let message = error.message;
    if (message.includes("not supported for this document")) {
      message = "Tệp của bạn đang ở định dạng Excel (.xlsx). Vui lòng vào Tệp > Lưu dưới dạng Google Trang tính để ứng dụng có thể hoạt động.";
    }
    res.status(500).json({ error: message });
  }
});

// API to submit a prediction
app.post("/api/predict", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

  const token = authHeader.split(" ")[1];
  const { matchId, prediction, email } = req.body;
  if (!token || token === "undefined") {
    return res.status(401).json({ error: "Mã xác thực không hợp lệ. Vui lòng đăng nhập lại." });
  }
  
  try {
    const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    auth.setCredentials({ access_token: token });

    const sheets = google.sheets({ version: "v4", auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "GhiNhan!A:D",
      valueInputOption: "RAW",
      requestBody: {
        values: [[email, matchId, prediction, new Date().toLocaleString('vi-VN')]],
      },
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error writing to sheets", error.message);
    if (error.code === 401 || error.message.includes("auth")) {
      return res.status(401).json({ error: "Phiên làm việc hết hạn. Vui lòng đăng nhập lại." });
    }
    res.status(500).json({ error: error.message });
  }
});

// API to sync scores and update BangXepHang
app.post("/api/sync-scores", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

  const token = authHeader.split(" ")[1];
  if (!token || token === "undefined") {
    return res.status(401).json({ error: "Mã xác thực không hợp lệ. Vui lòng đăng nhập lại." });
  }
  
  try {
    const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    auth.setCredentials({ access_token: token });

    const sheets = google.sheets({ version: "v4", auth });

    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: SPREADSHEET_ID,
      ranges: ["Bình chọn!A4:I", "GhiNhan!A:Z", "BangXepHang!A:Z"],
    });

    const valueRanges = response.data.valueRanges || [];
    const matchesData = valueRanges[0]?.values || [];
    const votesData = valueRanges[1]?.values || [];
    const existingLeaderboard = valueRanges[2]?.values || [];

    // 1. Process match outcomes
    const matchOutcomes: { [id: string]: string } = {};
    matchesData.forEach((row) => {
      const id = row[0];
      const tl1 = parseFloat(row[4] || "0");
      const tl2 = parseFloat(row[5] || "0");
      const bt1 = row[7];
      const bt2 = row[8];

      if (bt1 !== undefined && bt1 !== "" && bt2 !== undefined && bt2 !== "") {
        const score1 = parseFloat(bt1) - tl1;
        const score2 = parseFloat(bt2) - tl2;

        if (score1 > score2) matchOutcomes[id] = "HOME";
        else if (score1 < score2) matchOutcomes[id] = "AWAY";
        else matchOutcomes[id] = "DRAW";
      }
    });

    // 2. Process latest votes per user per match
    const userMatchVotes: { [user: string]: { [matchId: string]: string } } = {};
    votesData.slice(1).forEach((row) => {
      const user = row[0];
      const matchId = row[1];
      const prediction = row[2];
      if (user && user !== "Email" && matchId) {
        if (!userMatchVotes[user]) userMatchVotes[user] = {};
        userMatchVotes[user][matchId] = prediction;
      }
    });

    // 3. Calculate scores
    const userScores: { [user: string]: number } = {};
    Object.keys(userMatchVotes).forEach((user) => {
      let totalPoints = 0;
      Object.keys(userMatchVotes[user]).forEach((matchId) => {
        const outcome = matchOutcomes[matchId];
        if (outcome) {
          const prediction = userMatchVotes[user][matchId];
          if (prediction !== outcome && outcome !== "DRAW") {
            totalPoints -= 10;
          }
        }
      });
      userScores[user] = totalPoints;
    });

    // 4. Update BangXepHang data
    // Header: Email, Points, TienNop 1, ...
    let finalData: any[][] = [];
    const header = ["Email", "Points", "TienNop 1", "TienNop 2", "TienNop 3", "TienNop 4", "TienNop 5", "TienNop 6", "TienNop 7", "TienNop 8", "TienNop 9", "TienNop 10"];
    finalData.push(header);

    const processedUsers = new Set<string>();

    // Update existing rows (skipping header)
    for (let i = 1; i < existingLeaderboard.length; i++) {
      const row = [...existingLeaderboard[i]];
      const email = row[0];
      if (email && email !== "Email") {
        row[1] = userScores[email] || 0; // Update points
        processedUsers.add(email);
        finalData.push(row);
      }
    }

    // Add new users
    Object.keys(userScores).forEach((email) => {
      if (!processedUsers.has(email) && email !== "Email") {
        const newRow = [email, userScores[email]];
        // Pad with empty strings for TienNop columns if needed
        while (newRow.length < header.length) {
          newRow.push("");
        }
        finalData.push(newRow);
      }
    });

    // Clear and update BangXepHang
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: "BangXepHang!A1",
      valueInputOption: "RAW",
      requestBody: {
        values: finalData,
      },
    });

    res.json({ success: true, ranking: finalData.slice(1) });
  } catch (error: any) {
    console.error("Error syncing scores", error.message);
    if (error.code === 401 || error.message.includes("auth")) {
      return res.status(401).json({ error: "Phiên làm việc hết hạn. Vui lòng đăng nhập lại." });
    }
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
