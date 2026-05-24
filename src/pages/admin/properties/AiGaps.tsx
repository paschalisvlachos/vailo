import { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { getGenerativeModel } from "firebase/ai";
import { ai, db } from '../../../lib/firebase';
import { Sparkles, Loader2, Send, Bot, User, Search } from 'lucide-react';

export default function AiGaps() {
  const { property, propertyId } = useOutletContext<{ property: any, propertyId: string }>();
  
  const [features, setFeatures] = useState<any[]>([]);
  const [messages, setMessages] = useState<{role: 'ai' | 'user', text: string}[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Fetch Property Features to give the AI context
  useEffect(() => {
    if (!propertyId) return;
    const unsub = onSnapshot(collection(db, 'properties', propertyId, 'features'), (snap) => {
      setFeatures(snap.docs.map(doc => doc.data()));
    });
    return () => unsub();
  }, [propertyId]);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 2. The Auto-Analyzer (Admin Model)
  const analyzeGaps = async () => {
    setIsGenerating(true);
    setMessages([]); // Clear previous chat
    
    try {
      // 🔥 EXPLICITLY USE THE ADMIN MODEL HERE (e.g. flash or pro) 🔥
      const model = getGenerativeModel(ai, { model: "gemini-2.5-flash" });

      const featureNames = features.length > 0 ? features.map(f => f.name).join(', ') : "None added yet";

      const prompt = `You are a luxury hospitality consultant advising the owner of "${property?.propertyName}". 
      They currently offer these features/services: [${featureNames}].
      
      Analyze this offering. What 3 luxury services or experiences are missing that high-end guests typically expect? 
      Keep it brief, actionable, and formatted nicely.`;

      const result = await model.generateContent(prompt);
      setMessages([{ role: 'ai', text: result.response.text() }]);
    } catch (error) {
      console.error(error);
      setMessages([{ role: 'ai', text: "Failed to analyze gaps. Ensure your Firebase AI is configured." }]);
    } finally {
      setIsGenerating(false);
    }
  };

  // 3. Admin Chat Handler
  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsGenerating(true);

    try {
      // 🔥 EXPLICITLY USE THE ADMIN MODEL HERE 🔥
      const model = getGenerativeModel(ai, { model: "gemini-2.5-flash" });
      
      const history = messages.map(m => `${m.role === 'ai' ? 'Consultant' : 'Host'}: ${m.text}`).join('\n\n');
      const featureNames = features.length > 0 ? features.map(f => f.name).join(', ') : "None";

      const prompt = `You are an AI hospitality consultant advising a property host.
      Property: ${property?.propertyName}
      Current Features: ${featureNames}

      Conversation History:
      ${history}

      Host: ${userMsg}
      Consultant:`;

      const result = await model.generateContent(prompt);
      setMessages(prev => [...prev, { role: 'ai', text: result.response.text() }]);
    } catch (error) {
       setMessages(prev => [...prev, { role: 'ai', text: "Error connecting to AI." }]);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] min-h-[600px]">
      
      {/* Header */}
      <div className="flex justify-between items-center mb-6 shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center">
            <Sparkles className="mr-3 text-vailo-teal" size={28} />
            AI Gap Analyzer
          </h2>
          <p className="text-gray-500 mt-1">Consult with Vailo AI to find missing features and opportunities.</p>
        </div>
        <button 
          onClick={analyzeGaps} 
          disabled={isGenerating}
          className="flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-lg hover:opacity-90 shadow-sm disabled:opacity-50 transition-all"
        >
          {isGenerating ? <Loader2 size={18} className="animate-spin mr-2" /> : <Search size={18} className="mr-2" />}
          {messages.length === 0 ? "Analyze Property Gaps" : "Re-Analyze"}
        </button>
      </div>

      {/* Chat Window */}
      <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-4 overflow-y-auto mb-4 flex flex-col gap-4">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <Bot size={48} className="mb-4 opacity-50" />
            <p>Click "Analyze Property Gaps" to start, or type a question below.</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] p-4 rounded-2xl flex gap-3 ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-tr-sm' 
                  : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
              }`}>
                {msg.role === 'ai' && <Bot size={20} className="shrink-0 mt-0.5 text-vailo-teal" />}
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</div>
                {msg.role === 'user' && <User size={20} className="shrink-0 mt-0.5 opacity-80" />}
              </div>
            </div>
          ))
        )}
        {isGenerating && messages.length > 0 && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 p-4 rounded-2xl rounded-tl-sm shadow-sm flex items-center text-gray-500 text-sm">
              <Loader2 size={16} className="animate-spin mr-2 text-vailo-teal" /> AI is thinking...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Field */}
      <form onSubmit={handleSend} className="shrink-0 flex gap-3">
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isGenerating}
          placeholder="Ask the AI a question about your setup..." 
          className="flex-1 px-4 py-3 border border-gray-300 rounded-xl admin-input outline-none disabled:opacity-50 bg-white shadow-sm"
        />
        <button 
          type="submit"
          disabled={isGenerating || !input.trim()}
          className="px-6 py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-black disabled:opacity-50 transition-colors shadow-sm flex items-center"
        >
          <Send size={18} />
        </button>
      </form>

    </div>
  );
}