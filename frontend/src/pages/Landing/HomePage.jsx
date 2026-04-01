import Header from '../../components/Header';
import Footer from '../../components/ui/Footer';
import Section1 from './Section1';
import Section2 from './Section2';
import Section3 from './Section3';
import Section4 from './Section4';
import Section5 from './Section5';
import Section6 from './Section6';
import Section7 from './Section7';

const HomePage = ({ onCardSelect }) => {
  void onCardSelect;

  return (
    <div className="landing-page min-h-screen flex flex-col" style={{ backgroundColor: '#2A1740' }}>
      <Header />
      <main className="flex-grow">
        <Section1 />
        <Section2 />
        <Section3 />
        <Section4 />
        <Section5 />
        <Section6 />
        <Section7 />
      </main>
      <Footer />
    </div>
  );
};

export default HomePage;


