import React from 'react';
import { ge } from '../i18n/ge';
import { BookOpen, X, CheckCircle2 } from 'lucide-react';

interface HowToPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HowToPlayModal: React.FC<HowToPlayModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl text-slate-200">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-2 text-amber-400">
            <BookOpen className="w-5 h-5" />
            <h3 className="text-lg font-black">{ge.howToPlay}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
          <section>
            <h4 className="font-bold text-amber-300 text-sm mb-1">1. თამაშის მიზანი</h4>
            <p>
              თამაშობს 4 მოთამაშე ორ-ორ კაციან გუნდებად. მოწინააღმდეგეები სხედან ერთმანეთის პირისპირ.
              მიზანია პირველმა დააგროვოთ მატჩის სამიზნე ქულები (მაგ: 11 ქულა).
            </p>
          </section>

          <section>
            <h4 className="font-bold text-amber-300 text-sm mb-1">2. დასტა და ქულები</h4>
            <p>გამოიყენება 36-კარტიანი დასტა (6-დან ტუზამდე). ჯამური ქულაა 120:</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5 text-slate-400">
              <li>ტუზი (A): 11 ქულა</li>
              <li>10-იანი: 10 ქულა</li>
              <li>მეფე (K): 4 ქულა</li>
              <li>დამა (Q): 3 ქულა</li>
              <li>ვალეტი (J): 2 ქულა</li>
              <li>6, 7, 8, 9: 0 ქულა</li>
            </ul>
          </section>

          <section>
            <h4 className="font-bold text-amber-300 text-sm mb-1">3. სვლის წესები</h4>
            <p>
              პირველ სვლაზე შეგიძლიათ ჩამოხვიდეთ 1-დან 5-მდე <strong>ერთი და იმავე მასტის</strong> კარტით.
              დანარჩენმა მოთამაშეებმა უნდა დადონ ზუსტად იგივე რაოდენობის კარტი.
            </p>
          </section>

          <section>
            <h4 className="font-bold text-amber-300 text-sm mb-1">4. კარტის გაჭრა</h4>
            <p>
              კარტების გაჭრისთვის თქვენმა კარტებმა 1-ზე-1 შესაბამისობით უნდა გადაჭრას წინა დროებითი ლიდერის ყველა კარტი:
            </p>
            <ul className="list-disc list-inside mt-1 space-y-0.5 text-slate-400">
              <li>იმავე მასტის უფრო მაღალი რანგი ჭრის დაბალს</li>
              <li>ნებისმიერი კოზირი ჭრის არაკოზირს</li>
              <li>სხვა მასტის არაკოზირი ვერ ჭრის არაკოზირს</li>
            </ul>
          </section>

          <section>
            <h4 className="font-bold text-amber-300 text-sm mb-1">5. გაზრდის სისტემა („დავი“)</h4>
            <p>
              რაუნდის მსვლელობისას შეგიძლიათ გამოაცხადოთ გაზრდა: დავი (2ქ), სე (3ქ), ჩარი (4ქ), ფანჯი (5ქ), შაში (6ქ).
              მოწინააღმდეგე გუნდს შეუძლია მიიღოს შეთავაზება ან უარი თქვას (დათმოს რაუნდი).
            </p>
          </section>

          <section>
            <h4 className="font-bold text-amber-300 text-sm mb-1">6. ბურა (5 კოზირი)</h4>
            <p>
              თუ ხელში აღმოგაჩნდათ 5 კოზირი, შეგიძლიათ გამოაცხადოთ „ბურა“ და ავტომატურად მოიგოთ მიმდინარე რაუნდი!
            </p>
          </section>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black py-2.5 rounded-xl text-xs transition-colors"
        >
          გასაგებია
        </button>
      </div>
    </div>
  );
};
