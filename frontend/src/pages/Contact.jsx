import { useTranslation } from 'react-i18next';
import Header from '../components/Header';
import Footer from '../components/ui/Footer';

const Contact = () => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: '#FFFBE9' }}>
      <Header />

      <section className="w-full py-20 bg-white">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="h1-heading text-4xl md:text-6xl font-bold text-gray-900 mb-6">
              {t('navigation.contactUs')}
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              {t('homepage.contactUs')}
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Contact;



