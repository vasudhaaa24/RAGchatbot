"use client";

import Image from "next/image";
import { useState } from "react";
import Logo from "./assets/jiopaylogo.png";
import Bubble from "../components/Bubble";
import LoadingBubble from "../components/LoadingBubble";

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
}

const Home = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const noMessages = messages.length === 0;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;

        const newMessage: Message = {
            id: crypto.randomUUID(),
            content: input,
            role: "user"
        };
        setMessages((prev) => [...prev, newMessage]);
        setInput("");
        handleStreamResponse([...messages, newMessage]);
    };

    const handleStreamResponse = async (updatedMessages: Message[]) => {
        setIsLoading(true);
        const response = await fetch("/api/chat", {
            method: "POST",
            body: JSON.stringify({ messages: updatedMessages }),
        });

        if (!response.body) {
            setIsLoading(false);
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let botReply = "";
        let newMessages = [...updatedMessages];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            botReply += decoder.decode(value, { stream: true });

            // **Format response to remove unnecessary metadata**
            const formattedReply = botReply.replace(/^\s*Response:\s*/i, "").replace(/<\/s>$/, "").trim();

            // **Update last assistant message instead of overwriting all**
            setMessages((prevMessages) => {
                const lastMessage = prevMessages[prevMessages.length - 1];
                if (lastMessage?.role === "assistant") {
                    return [
                        ...prevMessages.slice(0, -1), 
                        { ...lastMessage, content: formattedReply }
                    ];
                } else {
                    return [
                        ...prevMessages, 
                        { id: crypto.randomUUID(), content: formattedReply, role: "assistant" }
                    ];
                }
            });
        }

        setIsLoading(false);
    };

    return (
        <main>
            <Image src={Logo} width={180} alt="Jio Logo" />
            
            <section className={noMessages ? "" : "populated"}>
                {noMessages ? (
                    <p className="starter-text">
                        Get instant support and answers for all your Jio Pay queries with our AI-powered assistant, ensuring seamless transactions and hassle-free assistance.
                    </p>
                ) : (
                    <>
                        {messages.map((message, index) => (
                            <Bubble key={`message-${index}`} message={message} />
                        ))}
                        {isLoading && <LoadingBubble />}
                    </>
                )}
            </section>

            <form onSubmit={handleSubmit}>
                <input 
                    className="question-box" 
                    onChange={(e) => setInput(e.target.value)} 
                    value={input} 
                    placeholder="Ask your queries..."
                />
                <input type="submit" />
            </form>
        </main>
    );
};

export default Home;
