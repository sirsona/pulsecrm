import Header from "@/components/Header";

export default function TreasurerLayout({ children }) {
  return (
    <>
      <Header />
      {children}
    </>
  );
}
