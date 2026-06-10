type Props = {
  className?: string;
  alt?: string;
};

/** Vailo brand mark — public/V.png */
export default function VailoMark({ className = 'w-full h-full object-contain', alt = 'Vailo' }: Props) {
  return <img src="/V.png" alt={alt} className={className} draggable={false} />;
}
