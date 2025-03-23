import PromptSuggestionButton from "./PromptSuggestionButton"

const PromptSuggestionsRow = ({onPromptClick}) => {
    const prompts = [
        "How do I send money using Jio Pay?",
        "My transaction failed, but the money was deducted. What should I do?",
        "How can I check my Jio Pay transaction history?",
        "Can I disable UPI payments temporarily?"
    ]
    return (
        <div className="prompt-suggestion-row">
            {prompts.map((prompt, index) => <PromptSuggestionButton 
            key={`suggestion-${index}`}
            text={prompt}
            onClick={() => onPromptClick(prompt)}
            />)}
        </div>
    )
}

export default PromptSuggestionsRow