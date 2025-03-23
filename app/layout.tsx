import "./global.css"

export const metadata = {
    title: "Jio Pay Support",
    description: "A chat bot support for Jio Pay related queries",
};
  

const RootLayout = ({children}) => {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    )
}

export default RootLayout;