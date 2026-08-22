import { ChevronDown } from 'lucide-react';
import Brand from './Brand';
import { profileHandle } from './profile';

function Header({ compact = false, onReset, perfil }) {
  return (
    <header className={`site-header ${compact ? "site-header--compact" : ""}`}>
      <Brand />
      {compact ? (
        <button className="profile-pill" type="button" onClick={onReset}>
          <span className="mini-avatar">IN</span>
          <span>@{profileHandle(perfil)}</span>
          <ChevronDown size={15} strokeWidth={1.8} />
        </button>
      ) : (
        <div className="header-note">
          <span className="status-dot" /> simulación privada
        </div>
      )}
    </header>
  );
}

export default Header;
