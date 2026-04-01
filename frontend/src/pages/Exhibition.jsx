import { useTranslation } from 'react-i18next';
import Header from '../components/Header';
import Footer from '../components/ui/Footer';

const Exhibition = () => {
  const { t } = useTranslation();

  const exhibitions = [
    {
      id: 1,
      title: t('exhibition.item1.title'),
      date: t('exhibition.item1.date'),
      location: t('exhibition.item1.location'),
      description: t('exhibition.item1.description'),
    },
    {
      id: 2,
      title: t('exhibition.item2.title'),
      date: t('exhibition.item2.date'),
      location: t('exhibition.item2.location'),
      description: t('exhibition.item2.description'),
    },
    {
      id: 3,
      title: t('exhibition.item3.title'),
      date: t('exhibition.item3.date'),
      location: t('exhibition.item3.location'),
      description: t('exhibition.item3.description'),
    },
  ];

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: '#FFFBE9' }}>
      <Header />
      
      {/* Hero Section */}
      <section className="w-full py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h1 className="h1-heading text-4xl md:text-6xl font-bold text-gray-900 mb-6">
              {t('exhibition.title')}
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              {t('exhibition.subtitle')}
            </p>
          </div>
        </div>
      </section>

      {/* Exhibitions List */}
      <section className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-8">
            {exhibitions.map((exhibition) => (
              <div
                key={exhibition.id}
                className="bg-white border border-gray-200 rounded-lg p-8 hover:shadow-lg transition-shadow"
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between mb-4">
                  <div>
                    <h2 className="h2-text text-2xl font-bold text-gray-900 mb-2">
                      {exhibition.title}
                    </h2>
                    <div className="flex flex-col md:flex-row md:gap-4 text-gray-600">
                      <p className="flex items-center">
                        <span className="mr-2">📅</span>
                        {exhibition.date}
                      </p>
                      <p className="flex items-center">
                        <span className="mr-2">📍</span>
                        {exhibition.location}
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-gray-700 leading-relaxed mt-4">
                  {exhibition.description}
                </p>
                <div className="mt-6">
                  <button className="bg-gray-800 text-white px-6 py-3 rounded-lg font-medium hover:bg-gray-700 transition-colors">
                    {t('common.learnMore')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Exhibition;




