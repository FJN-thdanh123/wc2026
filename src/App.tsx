/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Trophy, Calendar, Users, LogIn, ChevronRight, CheckCircle2, AlertCircle, Loader2, RefreshCw, Wallet, HandCoins } from "lucide-react";

interface Match {
  uid: string;
  id: string;
  teamA: string;
  teamB: string;
  handicap: string;
  time: string;
  status: string;
  result?: string;
}

interface Summary {
  uid: string;
  user: string;
  points: number;
  rank: number;
  paidInfo?: string[];
}

interface UserVote {
  matchId: string;
  prediction: string;
}

export default function App() {
  const [user, setUser] = useState<{ email: string; name: string } | null>(null);
  const [tokens, setTokens] = useState<any>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [summary, setSummary] = useState<Summary[]>([]);
  const [userVotes, setUserVotes] = useState<UserVote[]>([]);
  const [activeTab, setActiveTab] = useState<'matches' | 'payments'>('matches');
  const [matchFilter, setMatchFilter] = useState<'Upcoming' | 'Finished' | 'All'>('Upcoming');
  const [daysOffset, setDaysOffset] = useState<number>(7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    const savedTokens = localStorage.getItem("google_tokens");
    const savedUser = localStorage.getItem("google_user");
    if (savedTokens) {
      setTokens(JSON.parse(savedTokens));
      if (savedUser) setUser(JSON.parse(savedUser));
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        const { tokens } = event.data;
        setTokens(tokens);
        localStorage.setItem("google_tokens", JSON.stringify(tokens));
        fetchUserInfo(tokens.access_token);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    if (tokens) {
      fetchData();
    }
  }, [tokens]);

  const fetchUserInfo = async (accessToken: string) => {
    try {
      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      setUser({ email: data.email, name: data.name });
      localStorage.setItem("google_user", JSON.stringify({ email: data.email, name: data.name }));
    } catch (err) {
      console.error("Failed to fetch user info", err);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/data", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      
      if (res.status === 401) {
        handleLogout();
        return;
      }

      const data = await res.json();
      
      if (res.status === 500 && data.error) {
        setError(data.error);
        return;
      }

      if (data.matches) {
        console.log("Matches data received:", data.matches);
        // Mapping based on user image:
        // 0:Trận, 1:Ngày, 2:Giờ, 3:Đội 1, 4:TL chấp 1, 5:TL chấp 2, 6:Đội 2, 7:BT1, 8:BT2
        const formattedMatches = data.matches.map((row: any[], index: number) => {
          const teamA = row[3];
          const teamB = row[6];
          const scoreA = row[7];
          const scoreB = row[8];
          
          return {
            uid: `match-${row[0] || 'empty'}-${index}`,
            id: row[0] || "N/A",
            teamA: teamA || "N/A",
            teamB: teamB || "N/A",
            handicap: (row[4] !== undefined || row[5] !== undefined) ? `${row[4] || '0'} : ${row[5] || '0'}` : "0",
            time: `${row[1] || ''} ${row[2] || ''}`.trim() || "TBD",
            status: (scoreA !== undefined && scoreA !== "") ? "Finished" : "Upcoming",
            result: (scoreA !== undefined && scoreA !== "" && scoreB !== undefined && scoreB !== "") ? `${scoreA} - ${scoreB}` : undefined,
          };
        }).filter((m: any) => m.teamA !== "N/A" && m.teamB !== "N/A" && m.id !== "Trận");
        setMatches(formattedMatches);
      }
      if (data.summary) {
        const formattedSummary = data.summary
          .slice(1)
          .map((row: any[], index: number) => ({
            uid: `summary-${row[0] || "unknown"}-${index}`,
            user: row[0],
            points: parseInt(row[1]) || 0,
            rank: 0,
            paidInfo: row.slice(2), // TienNop 1 to 10
          }))
          .sort((a: any, b: any) => b.points - a.points)
          .map((item: any, index: number) => ({
            ...item,
            rank: index + 1,
          }));
        setSummary(formattedSummary);
      }
      if (data.votes && user) {
        // Filter votes for current user, keep the latest one for each matchId
        const userPredictions: { [key: string]: string } = {};
        data.votes.forEach((row: any[]) => {
          if (row[0] === user.email) {
            userPredictions[row[1]] = row[2];
          }
        });
        const formattedVotes = Object.keys(userPredictions).map(matchId => ({
          matchId,
          prediction: userPredictions[matchId]
        }));
        setUserVotes(formattedVotes);
      }
    } catch (err) {
      console.error("Failed to fetch matches", err);
    } finally {
      setLoading(false);
    }
  };

  const login = async () => {
    const res = await fetch("/api/auth/url");
    const { url } = await res.json();
    window.open(url, "oauth_popup", "width=600,height=700");
  };

  const [syncing, setSyncing] = useState(false);

  const handleSyncScores = async () => {
    if (!tokens) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/sync-scores", {
        method: "POST",
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      if (res.status === 401) {
        handleLogout();
        return;
      }

      if (res.ok) {
        await fetchData(); // Refresh data to show new scores
      }
    } catch (err) {
      console.error("Sync failed", err);
    } finally {
      setSyncing(false);
    }
  };

  const handlePredict = async (matchId: string, prediction: string) => {
    if (!tokens || !user) return;
    setSubmitting(matchId);
    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokens.access_token}`,
        },
        body: JSON.stringify({
          matchId,
          prediction,
          email: user.email,
        }),
      });

      if (res.status === 401) {
        handleLogout();
        return;
      }

      if (res.ok) {
        // Update local state for instant feedback
        setUserVotes((prev) => {
          const filtered = prev.filter((v) => v.matchId !== matchId);
          return [...filtered, { matchId, prediction }];
        });
        // Success alert or silent update
      }
    } catch (err) {
      console.error("Prediction failed", err);
    } finally {
      setSubmitting(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("google_tokens");
    localStorage.removeItem("google_user");
    setUser(null);
    setTokens(null);
  };

  const parseSheetDate = (dateStr: string) => {
    try {
      const parts = dateStr.split(/[-/]/);
      if (parts.length < 2) return null;
      
      const today = new Date();
      let day, month, year;
      
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        year = parseInt(parts[0]);
        month = parseInt(parts[1]) - 1;
        day = parseInt(parts[2]);
      } else {
        // DD-MM-YYYY or DD-MM
        day = parseInt(parts[0]);
        month = parseInt(parts[1]) - 1;
        year = parts.length >= 3 ? parseInt(parts[2]) : today.getFullYear();
      }
      
      const date = new Date(year, month, day);
      if (isNaN(date.getTime())) return null;
      return date;
    } catch (e) {
      return null;
    }
  };

  const getVietnameseDay = (dateStr: string) => {
    const date = parseSheetDate(dateStr);
    if (!date) return "";
    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    return days[date.getDay()];
  };

  const filteredMatchesByCategory = matches.filter((m) => {
    if (matchFilter === 'All') return true;
    if (m.status !== matchFilter) return false;
    
    if (matchFilter === 'Upcoming') {
      const matchDate = parseSheetDate(m.time.split(" ")[0]);
      if (!matchDate) return true; // Show it if we can't parse it
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const limitDate = new Date();
      limitDate.setDate(today.getDate() + daysOffset);
      limitDate.setHours(23, 59, 59, 999);
      
      return matchDate >= today && matchDate <= limitDate;
    }
    
    return true;
  });

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#0f172a] font-sans">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-[#ef4444] p-1.5 rounded-lg">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-bold text-xl tracking-tight">WorldCup 2026</h1>
          </div>
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium hidden sm:block text-slate-600">{user.email}</span>
              <button 
                onClick={handleLogout}
                className="text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-red-600 transition-colors"
              >
                Logout
              </button>
            </div>
          ) : (
            <button
              onClick={login}
              className="flex items-center gap-2 bg-[#0f172a] text-white px-4 py-2 rounded-full text-sm font-semibold hover:bg-slate-800 transition-all shadow-sm"
            >
              <LogIn className="w-4 h-4" />
              Sign in with Google
            </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {!user ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200 max-w-md w-full border border-slate-100"
            >
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trophy className="w-10 h-10 text-red-500" />
              </div>
              <h2 className="text-2xl font-bold mb-3">Dự đoán tỷ số WordCup 2026</h2>
              <p className="text-slate-500 mb-8 leading-relaxed">
                Đăng nhập bằng Google để tham gia bình chọn các trận đấu, xem tỉ lệ chấp và theo dõi điểm số cá nhân.
              </p>
              <button
                onClick={login}
                className="w-full flex items-center justify-center gap-3 bg-[#0f172a] text-white py-4 rounded-xl font-bold text-lg hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-slate-300"
              >
                <LogIn className="w-6 h-6" />
                Bắt đầu ngay
              </button>
            </motion.div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Tab Switcher */}
            <div className="flex p-1.5 bg-slate-100 rounded-2xl w-fit mx-auto sm:mx-0">
              <button
                onClick={() => setActiveTab('matches')}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  activeTab === 'matches' 
                    ? 'bg-white text-[#0f172a] shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Calendar className="w-4 h-4" />
                Trận đấu
              </button>
              <button
                onClick={() => setActiveTab('payments')}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  activeTab === 'payments' 
                    ? 'bg-white text-[#0f172a] shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Wallet className="w-4 h-4" />
                Nộp tiền
              </button>
            </div>

            {activeTab === 'matches' ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Error Alert */}
                <AnimatePresence>
                  {error && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="lg:col-span-3 overflow-hidden"
                    >
                      <div className="bg-red-50 border border-red-200 p-4 rounded-2xl flex items-start gap-3 mb-4">
                        <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                        <div className="text-sm text-red-800 font-medium">{error}</div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Matches List */}
                <section className="lg:col-span-2 space-y-6">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-2xl font-bold flex items-center gap-2">
                        <Calendar className="w-6 h-6 text-red-500" />
                        Lịch thi đấu & Bình chọn
                      </h2>
                      <button 
                        onClick={fetchData} 
                        className="p-2 rounded-full hover:bg-slate-100 transition-colors"
                        title="Refresh data"
                      >
                        <Loader2 className={`w-5 h-5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex gap-2 bg-slate-100 p-1 rounded-xl w-fit">
                        {(['Upcoming', 'Finished', 'All'] as const).map((f) => (
                          <button
                            key={f}
                            onClick={() => {
                              setMatchFilter(f);
                            }}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              matchFilter === f 
                                ? 'bg-white text-[#0f172a] shadow-sm' 
                                : 'text-slate-500 hover:text-slate-700'
                            }`}
                          >
                            {f === 'Upcoming' ? 'Sắp diễn ra' : f === 'Finished' ? 'Đã kết thúc' : 'Tất cả'}
                          </button>
                        ))}
                      </div>

                      {matchFilter === 'Upcoming' && (
                        <div className="flex items-center gap-2 bg-white border border-slate-100 px-3 py-1.5 rounded-xl shadow-sm">
                          <span className="text-[10px] font-black text-slate-400 uppercase">Trong vòng</span>
                          <input 
                            type="number" 
                            value={daysOffset} 
                            onChange={(e) => setDaysOffset(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-12 text-center font-bold text-sm bg-slate-50 rounded border-none p-0 focus:ring-0"
                          />
                          <span className="text-[10px] font-black text-slate-400 uppercase">ngày tới</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {loading && matches.length === 0 ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="h-40 bg-slate-100 rounded-2xl animate-pulse" />
                      ))}
                    </div>
                  ) : matches.length === 0 ? (
                    <div className="bg-white p-12 rounded-3xl text-center border border-dashed border-slate-300">
                      <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                      <p className="text-slate-500 font-medium">Chưa có dữ liệu trận đấu. Vui lòng cập nhật Google Sheet.</p>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {filteredMatchesByCategory.length === 0 ? (
                        <div className="bg-white p-12 rounded-3xl text-center border border-dashed border-slate-300">
                          <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                          <p className="text-slate-500 font-medium">Không tìm thấy trận đấu nào phù hợp.</p>
                        </div>
                      ) : (
                        filteredMatchesByCategory.map((match) => (
                          <motion.div
                            layout
                            key={match.uid}
                            className="bg-white p-3 sm:p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden"
                          >
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-[8px] uppercase font-bold tracking-widest text-slate-400">
                                {getVietnameseDay(match.time.split(" ")[0])} • #{match.id}
                              </span>
                              <span className="text-[10px] font-semibold text-slate-500">
                                {match.time}
                              </span>
                            </div>
                            
                            <div className="grid grid-cols-11 items-center">
                              {/* Team A */}
                              <div className="col-span-4 flex items-center gap-2">
                                <div className="w-8 h-8 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100 shrink-0">
                                  <span className="text-sm font-black">{match.teamA[0]}</span>
                                </div>
                                <span className="font-bold text-sm truncate">{match.teamA}</span>
                              </div>
                              
                              {/* Handicap */}
                              <div className="col-span-3 text-center">
                                <div className="text-[8px] font-bold text-red-500 mb-0.5">CHẤP</div>
                                <div className="text-base font-black bg-red-50 text-red-600 inline-block px-2 rounded">
                                  {match.handicap}
                                </div>
                              </div>

                              {/* Team B */}
                              <div className="col-span-4 flex flex-row-reverse items-center gap-2">
                                <div className="w-8 h-8 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100 shrink-0">
                                  <span className="text-sm font-black">{match.teamB[0]}</span>
                                </div>
                                <span className="font-bold text-sm truncate text-right">{match.teamB}</span>
                              </div>
                            </div>

                            <div className="flex gap-1.5 mt-3">
                              {['HOME', 'DRAW', 'AWAY'].map((type) => {
                                const isSelected = userVotes.find(v => v.matchId === match.id)?.prediction === type;
                                const isFinished = match.status === "Finished";
                                
                                return (
                                  <button
                                    key={type}
                                    disabled={submitting === match.id || isFinished}
                                    onClick={() => handlePredict(match.id, type)}
                                    className={`flex-1 py-1.5 px-1 rounded-lg font-bold text-[10px] transition-all disabled:opacity-50 ${
                                      isSelected 
                                        ? 'bg-[#0f172a] text-white ring-1 ring-offset-1 ring-red-500' 
                                        : 'bg-slate-50 hover:bg-slate-200 text-slate-800'
                                    }`}
                                  >
                                    {submitting === match.id ? '...' : type}
                                    {isSelected && <span className="ml-1 opacity-70">✓</span>}
                                  </button>
                                );
                              })}
                            </div>

                            {match.result && (
                              <div className="absolute top-0 right-0 px-1.5 py-0.5 bg-green-500 text-white text-[8px] font-black rounded-bl-md">
                                {match.result}
                              </div>
                            )}
                          </motion.div>
                        ))
                      )}
                    </div>
                  )}
                </section>

                {/* Sidebar / Leaderboard */}
                <aside className="space-y-6">
                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        <Users className="w-5 h-5 text-red-500" />
                        Bảng xếp hạng
                      </h2>
                      <button 
                        onClick={handleSyncScores}
                        disabled={syncing || loading}
                        className="p-2 bg-slate-50 text-slate-400 hover:text-slate-900 rounded-lg transition-colors disabled:opacity-50"
                        title="Cập nhật bảng điểm"
                      >
                        <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                    <div className="space-y-4">
                      {summary.length === 0 ? (
                        <p className="text-slate-400 text-sm italic">Đang cập nhật bảng điểm...</p>
                      ) : (
                        summary.map((item) => (
                          <div key={item.uid} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${item.rank === 1 ? 'bg-yellow-400 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                {item.rank}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-sm font-bold truncate max-w-[120px]">{item.user?.split('@')[0] || 'Unknown'}</span>
                                <div className="flex gap-1">
                                  <span className="text-[10px] text-slate-400 uppercase">Points</span>
                                  {item.paidInfo && item.paidInfo.filter(p => p && p.trim() !== "").length > 0 && (
                                    <span className="text-[10px] text-green-500 font-bold uppercase">
                                      • {item.paidInfo.filter(p => p && p.trim() !== "").length} Paid
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="text-xl font-black text-slate-800">
                              {item.points}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    
                    <div className="mt-8 pt-6 border-t border-slate-100">
                      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Thông tin cá nhân</h3>
                      <div className="bg-slate-50 p-4 rounded-2xl flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-900 rounded-full flex items-center justify-center text-white font-bold">
                          {user?.name?.[0] || '?'}
                        </div>
                        <div>
                          <div className="text-sm font-bold">{user?.name || 'User'}</div>
                          <div className="text-xs text-slate-500">{user?.email || 'N/A'}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Status card */}
                  <div className="bg-[#0f172a] text-white p-6 rounded-3xl shadow-xl shadow-slate-300">
                    <h3 className="font-bold mb-2 text-red-400">Quy tắc tính điểm</h3>
                    <ul className="text-xs text-slate-400 space-y-2">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />
                        <span>Dự đoán sai (tổng kết sau chấp): <b>Trừ 10 điểm</b></span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-3 h-3 text-green-500 mt-0.5 shrink-0" />
                        <span>Dự đoán đúng hoặc Hòa: Không bị trừ điểm</span>
                      </li>
                    </ul>
                  </div>
                </aside>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Financial Overview Cards */}
                {(() => {
                  const userAccount = summary.find(s => s.user === user.email);
                  const points = userAccount?.points || 0;
                  const pointsVal = points;
                  const totalPaid = userAccount?.paidInfo
                    ? userAccount.paidInfo.reduce((acc, val) => acc + (parseFloat(val) || 0), 0)
                    : 0;
                  const balance = pointsVal + totalPaid;

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                        <div className="flex items-center gap-4 mb-4">
                          <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center">
                            <AlertCircle className="w-6 h-6 text-red-500" />
                          </div>
                          <div>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Tiền phạt (Điểm)</p>
                            <p className="text-2xl font-black text-red-600">{Math.abs(pointsVal).toLocaleString()}</p>
                          </div>
                        </div>
                        <p className="text-xs text-slate-500">Dựa trên {points} điểm tích lũy</p>
                      </motion.div>

                      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                        <div className="flex items-center gap-4 mb-4">
                          <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center">
                            <HandCoins className="w-6 h-6 text-green-500" />
                          </div>
                          <div>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Đã nộp</p>
                            <p className="text-2xl font-black text-green-600">{totalPaid.toLocaleString()}</p>
                          </div>
                        </div>
                        <p className="text-xs text-slate-500">Tổng từ các đợt thanh toán</p>
                      </motion.div>

                      <motion.div 
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                        className={`p-6 rounded-3xl border shadow-sm ${balance >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-amber-50 border-amber-100'}`}
                      >
                        <div className="flex items-center gap-4 mb-4">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${balance >= 0 ? 'bg-blue-100' : 'bg-amber-100'}`}>
                            <Wallet className={`w-6 h-6 ${balance >= 0 ? 'text-blue-600' : 'text-amber-600'}`} />
                          </div>
                          <div>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{balance >= 0 ? 'Số dư' : 'Còn thiếu'}</p>
                            <p className={`text-2xl font-black ${balance >= 0 ? 'text-blue-600' : 'text-amber-600'}`}>
                              {Math.abs(balance).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-slate-500">{balance >= 0 ? 'Bạn đã nộp đủ' : 'Cần hoàn tất thanh toán'}</p>
                      </motion.div>
                    </div>
                  );
                })()}

                {/* Detailed Table */}
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      <Users className="w-5 h-5 text-indigo-500" />
                      Chi tiết nộp tiền & Điểm số
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-black tracking-widest">
                        <tr>
                          <th className="px-6 py-4">Thành viên</th>
                          <th className="px-6 py-4">Điểm</th>
                          <th className="px-6 py-4">Tổng Phạt</th>
                          <th className="px-6 py-4">Tổng Đã Nộp</th>
                          <th className="px-6 py-4">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {summary.map((item) => {
                          const pointsVal = item.points;
                          const totalPaid = item.paidInfo
                            ? item.paidInfo.reduce((acc, val) => acc + (parseFloat(val) || 0), 0)
                            : 0;
                          const balance = pointsVal + totalPaid;

                          return (
                            <tr key={item.uid} className={`hover:bg-slate-50 transition-colors ${item.user === user?.email ? 'bg-indigo-50/30' : ''}`}>
                              <td className="px-6 py-4">
                                <div className="font-bold text-slate-900">{item.user?.split('@')[0]}</div>
                                <div className="text-[10px] text-slate-400">{item.user}</div>
                              </td>
                              <td className="px-6 py-4 font-black text-slate-600">{item.points}</td>
                              <td className="px-6 py-4 text-red-600 font-bold">{Math.abs(pointsVal).toLocaleString()}</td>
                              <td className="px-6 py-4 text-green-600 font-bold">{totalPaid.toLocaleString()}</td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${balance >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                                  {balance >= 0 ? 'Đã nộp đủ' : `Thiếu ${Math.abs(balance).toLocaleString()}`}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
      
      <footer className="mt-20 border-t border-slate-200 py-10 bg-white">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <p className="text-slate-400 text-sm">World Cup 2026 Prediction App • Powered by Google Sheets</p>
        </div>
      </footer>
    </div>
  );
}

